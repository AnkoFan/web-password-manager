import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import {
  DeleteConfirmDialog,
  type DeleteTarget,
} from "./components/DeleteConfirmDialog"
import { AccountDetailDialog } from "./components/AccountDetailDialog"
import {
  PrimaryNavigation,
  type VaultView,
} from "./components/PrimaryNavigation"
import { SearchResults } from "./components/SearchResults"
import { SettingsView } from "./components/SettingsView"
import { TopBar } from "./components/TopBar"
import { TrashView } from "./components/TrashView"
import type { VaultEntry } from "./components/VaultTable"
import { VaultWorkspace } from "./components/VaultWorkspace"
import {
  VaultEditorDialog,
  type EditorState,
} from "./components/VaultEditorDialog"
import { shouldFocusGlobalSearch } from "./keyboard"

import {
  vaultClient,
  type AccountDraft,
  type AccountDetail,
  type Category,
  type SearchResult,
  type TrashItem,
  type Website,
  type WebsiteDraft,
} from "@/services/vault-client"
import { sortVaultNames } from "@/services/vault-order"

type PreferredSelection = {
  categoryId?: string | null
  websiteId?: string | null
  accountId?: string | null
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请重试。"
}

export function AppShell() {
  const [view, setView] = useState<VaultView>("vault")
  const [categories, setCategories] = useState<Category[]>([])
  const [websites, setWebsites] = useState<Website[]>([])
  const [entries, setEntries] = useState<VaultEntry[]>([])
  const [trashItems, setTrashItems] = useState<TrashItem[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  )
  const [selectedWebsiteId, setSelectedWebsiteId] = useState<string | null>(
    null,
  )
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null,
  )
  const [selectedWebsiteIds, setSelectedWebsiteIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [query, setQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [accountEditor, setAccountEditor] = useState<{
    account: AccountDetail
    websiteName: string
  } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [loading, setLoading] = useState(true)
  const editorTriggerRef = useRef<HTMLElement | null>(null)
  const accountEditorTriggerRef = useRef<HTMLElement | null>(null)
  const deleteTriggerRef = useRef<HTMLElement | null>(null)

  function captureDialogTrigger(ref: { current: HTMLElement | null }) {
    ref.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
  }

  function restoreDialogFocus(target: HTMLElement | null) {
    window.setTimeout(() => {
      if (target?.isConnected && !target.matches(":disabled")) {
        target.focus()
        return
      }
      document.getElementById("global-search")?.focus()
    }, 0)
  }

  function openEditor(nextEditor: EditorState) {
    captureDialogTrigger(editorTriggerRef)
    setEditor(nextEditor)
  }

  function closeEditor() {
    const trigger = editorTriggerRef.current
    editorTriggerRef.current = null
    setEditor(null)
    restoreDialogFocus(trigger)
  }

  function openDeleteDialog(target: DeleteTarget) {
    captureDialogTrigger(deleteTriggerRef)
    setDeleteTarget(target)
  }

  function openAccountEditor(account: AccountDetail, websiteName: string) {
    captureDialogTrigger(accountEditorTriggerRef)
    setAccountEditor({ account, websiteName })
  }

  function closeAccountEditor() {
    const trigger = accountEditorTriggerRef.current
    accountEditorTriggerRef.current = null
    setAccountEditor(null)
    restoreDialogFocus(trigger)
  }

  function closeDeleteDialog() {
    const trigger = deleteTriggerRef.current
    deleteTriggerRef.current = null
    setDeleteTarget(null)
    restoreDialogFocus(trigger)
  }

  async function refresh(preferred: PreferredSelection = {}) {
    const [nextCategories, nextWebsites, nextTrash] = await Promise.all([
      vaultClient.listCategories(),
      vaultClient.listWebsites(),
      vaultClient.listTrash(),
    ])
    const sortedCategories = sortVaultNames(nextCategories)
    const sortedWebsites = sortVaultNames(nextWebsites)
    setCategories(sortedCategories)
    setWebsites(sortedWebsites)
    setTrashItems(nextTrash)
    setSelectedWebsiteIds((current) => {
      const activeIds = new Set(sortedWebsites.map((website) => website.id))
      return new Set([...current].filter((id) => activeIds.has(id)))
    })

    const categoryId =
      preferred.categoryId === null
        ? null
        : sortedCategories.some(
              (category) =>
                category.id === (preferred.categoryId ?? selectedCategoryId),
            )
          ? (preferred.categoryId ?? selectedCategoryId)
          : (sortedCategories[0]?.id ?? null)
    const categoryWebsites = sortedWebsites.filter(
      (website) => website.categoryId === categoryId,
    )
    const nextEntries = (
      await Promise.all(
        categoryWebsites.map(async (website) => {
          const summaries = await vaultClient.listAccounts(website.id)
          if (summaries.length === 0) return [{ website, account: null }]
          const details = await Promise.all(
            summaries.map((summary) => vaultClient.getAccount(summary.id)),
          )
          return sortVaultNames(
            details.map((account) => ({
              ...account,
              name: account.displayName,
            })),
          ).map((account) => ({ website, account }))
        }),
      )
    ).flat()
    const websiteId =
      preferred.websiteId === null
        ? null
        : categoryWebsites.some(
              (website) =>
                website.id === (preferred.websiteId ?? selectedWebsiteId),
            )
          ? (preferred.websiteId ?? selectedWebsiteId)
          : (categoryWebsites[0]?.id ?? null)
    const accountId =
      preferred.accountId === null
        ? null
        : nextEntries.some(
              (entry) =>
                entry.account?.id ===
                (preferred.accountId ?? selectedAccountId),
            )
          ? (preferred.accountId ?? selectedAccountId)
          : (nextEntries.find((entry) => entry.account)?.account?.id ?? null)
    const selectedEntry = nextEntries.find(
      (entry) => entry.account?.id === accountId,
    )

    setSelectedCategoryId(categoryId)
    setSelectedWebsiteId(selectedEntry?.website.id ?? websiteId)
    setSelectedAccountId(accountId)
    setEntries(nextEntries)
    setRevealed({})
  }

  useEffect(() => {
    let active = true
    void refresh()
      .catch((error) => {
        if (active)
          toast.error("无法读取保险库", { description: errorMessage(error) })
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
    // Initial database load only. Subsequent refreshes are mutation-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      const modalOpen = Boolean(
        document.querySelector('[role="dialog"], [role="alertdialog"]'),
      )
      if (shouldFocusGlobalSearch(event, modalOpen)) {
        event.preventDefault()
        document.getElementById("global-search")?.focus()
      }
    }
    window.addEventListener("keydown", handleKeyboard)
    return () => window.removeEventListener("keydown", handleKeyboard)
  }, [])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed || view === "vault") {
      setSearchResults([])
      return
    }
    let active = true
    const timer = window.setTimeout(() => {
      void vaultClient
        .search(trimmed)
        .then((results) => {
          if (active) setSearchResults(results)
        })
        .catch((error) => {
          if (active)
            toast.error("搜索失败", { description: errorMessage(error) })
        })
    }, 180)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [query, view])

  async function selectCategory(categoryId: string) {
    setView("vault")
    setQuery("")
    setSelectedWebsiteIds(new Set())
    try {
      await refresh({ categoryId, websiteId: null, accountId: null })
    } catch (error) {
      toast.error("无法读取账号", { description: errorMessage(error) })
    }
  }

  async function saveCategory(id: string | undefined, name: string) {
    if (id) {
      await vaultClient.renameCategory(id, name)
      await refresh({ categoryId: id })
    } else {
      const created = await vaultClient.createCategory(name)
      await refresh({
        categoryId: created.id,
        websiteId: null,
        accountId: null,
      })
    }
    toast.success("分类已保存")
  }

  async function saveWebsite(draft: WebsiteDraft) {
    const saved = await vaultClient.saveWebsite(draft)
    await refresh({
      categoryId: saved.categoryId,
      websiteId: saved.id,
      accountId: draft.id === selectedWebsiteId ? selectedAccountId : null,
    })
    toast.success("网站已保存")
  }

  async function saveAccount(draft: AccountDraft) {
    const saved = await vaultClient.saveAccount(draft)
    const website = websites.find((entry) => entry.id === saved.websiteId)
    await refresh({
      categoryId: website?.categoryId,
      websiteId: saved.websiteId,
      accountId: saved.id,
    })
    toast.success("账号与字段已保存")
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const trigger = deleteTriggerRef.current
    try {
      if (deleteTarget.type === "category") {
        await vaultClient.deleteCategory(deleteTarget.id)
      } else if (deleteTarget.type === "website") {
        await vaultClient.deleteWebsite(deleteTarget.id)
      } else if (deleteTarget.type === "website-batch") {
        for (const websiteId of deleteTarget.ids) {
          await vaultClient.deleteWebsite(websiteId)
        }
        setSelectedWebsiteIds(new Set())
      } else {
        await vaultClient.deleteAccount(deleteTarget.id)
      }
      deleteTriggerRef.current = null
      setDeleteTarget(null)
      await refresh()
      restoreDialogFocus(trigger)
      toast.success("已移入回收站")
    } catch (error) {
      toast.error("删除失败", { description: errorMessage(error) })
    }
  }

  async function restore(groupIds: string[]) {
    try {
      await vaultClient.restoreMany(groupIds)
      await refresh()
      toast.success(`已恢复 ${groupIds.length} 个删除批次`)
    } catch (error) {
      toast.error("恢复失败", { description: errorMessage(error) })
      throw error
    }
  }

  async function permanentlyDelete(groupIds: string[]) {
    try {
      const result = await vaultClient.permanentlyDelete(groupIds)
      await refresh()
      toast.success(`已永久删除 ${result.affectedGroups} 个关联批次`)
    } catch (error) {
      toast.error("永久删除失败", { description: errorMessage(error) })
      throw error
    }
  }

  async function toggleReveal(fieldId: string, label: string) {
    if (revealed[fieldId]) {
      setRevealed((current) => {
        const next = { ...current }
        delete next[fieldId]
        return next
      })
      return
    }
    try {
      const value = await vaultClient.revealField(fieldId)
      setRevealed((current) => ({ ...current, [fieldId]: value }))
    } catch (error) {
      toast.error(`无法显示${label}`, { description: errorMessage(error) })
    }
  }

  async function copyField(fieldId: string, label: string) {
    try {
      await vaultClient.copyField(fieldId)
      toast.success(`已复制${label}`, {
        description: "通知中不会显示字段内容。",
      })
    } catch (error) {
      toast.error("复制失败", { description: errorMessage(error) })
    }
  }

  async function selectSearchResult(result: SearchResult) {
    setQuery("")
    setView("vault")
    try {
      await refresh({
        categoryId: result.categoryId,
        websiteId: result.websiteId,
        accountId: result.accountId,
      })
    } catch (error) {
      toast.error("无法定位搜索结果", { description: errorMessage(error) })
    }
  }

  const category =
    categories.find((entry) => entry.id === selectedCategoryId) ?? null
  return (
    <main className="vault-app">
      <PrimaryNavigation
        activeView={view}
        categories={categories}
        selectedCategoryId={selectedCategoryId}
        onNavigate={(nextView) => {
          setView(nextView)
          setQuery("")
        }}
        onSelectCategory={(id) => void selectCategory(id)}
        onCreateCategory={() => openEditor({ kind: "category" })}
        onEditCategory={() =>
          category ? openEditor({ kind: "category", category }) : undefined
        }
        onDeleteCategory={() =>
          category
            ? openDeleteDialog({
                type: "category",
                id: category.id,
                name: category.name,
                affectedCount: websites.filter(
                  (entry) => entry.categoryId === category.id,
                ).length,
              })
            : undefined
        }
      />
      <section className="workspace">
        <TopBar
          query={query}
          onQueryChange={(nextQuery) => {
            setQuery(nextQuery)
            if (view === "vault") setSelectedWebsiteIds(new Set())
          }}
          filterCurrentCategory={view === "vault"}
        />
        {loading ? (
          <div className="workspace-loading">正在读取保险库…</div>
        ) : query.trim() && view !== "vault" ? (
          <SearchResults
            query={query.trim()}
            results={searchResults}
            onSelect={(result) => void selectSearchResult(result)}
          />
        ) : view === "trash" ? (
          <TrashView
            items={trashItems}
            onRestore={restore}
            onPermanentlyDelete={permanentlyDelete}
          />
        ) : view === "settings" ? (
          <SettingsView />
        ) : (
          <VaultWorkspace
            category={category}
            entries={entries}
            filterQuery={query}
            selectedWebsiteId={selectedWebsiteId}
            selectedAccountId={selectedAccountId}
            selectedWebsiteIds={selectedWebsiteIds}
            revealed={revealed}
            onSelectWebsite={(websiteId, accountId = null) => {
              setSelectedWebsiteId(websiteId)
              setSelectedAccountId(accountId)
              setRevealed({})
            }}
            onSelectAccount={(accountId) => {
              setSelectedAccountId(accountId)
              setRevealed({})
            }}
            onCreateWebsite={() =>
              selectedCategoryId
                ? openEditor({
                    kind: "website",
                    categoryId: selectedCategoryId,
                  })
                : undefined
            }
            onEditWebsite={(selectedWebsite) =>
              openEditor({
                kind: "website",
                website: selectedWebsite,
                categoryId: selectedWebsite.categoryId,
              })
            }
            onDeleteWebsite={(selectedWebsite) =>
              openDeleteDialog({
                type: "website",
                id: selectedWebsite.id,
                name: selectedWebsite.name,
                affectedCount: entries.filter(
                  (entry) =>
                    entry.website.id === selectedWebsite.id && entry.account,
                ).length,
              })
            }
            onWebsiteSelectionChange={setSelectedWebsiteIds}
            onDeleteSelectedWebsites={(websiteIds) =>
              openDeleteDialog({
                type: "website-batch",
                ids: websiteIds,
                affectedCount: entries.filter(
                  (entry) =>
                    websiteIds.includes(entry.website.id) && entry.account,
                ).length,
              })
            }
            onSaveAccount={saveAccount}
            onEditAccount={(account, website) =>
              openAccountEditor(account, website.name)
            }
            onDeleteAccount={(selectedAccount) =>
              openDeleteDialog({
                type: "account",
                id: selectedAccount.id,
                name: selectedAccount.displayName,
              })
            }
            onOpenWebsite={async (selectedWebsite) => {
              try {
                await vaultClient.openWebsite(selectedWebsite.id)
              } catch (error) {
                toast.error("无法打开网址", {
                  description: errorMessage(error),
                })
              }
            }}
            onCopyField={copyField}
            onToggleReveal={toggleReveal}
          />
        )}
      </section>

      {editor ? (
        <VaultEditorDialog
          key={`${editor.kind}-${
            editor.kind === "category"
              ? (editor.category?.id ?? "new")
              : (editor.website?.id ?? "new")
          }`}
          editor={editor}
          categories={categories}
          onClose={closeEditor}
          onSaveCategory={saveCategory}
          onSaveWebsite={saveWebsite}
        />
      ) : null}
      {accountEditor ? (
        <AccountDetailDialog
          key={accountEditor.account.id}
          account={accountEditor.account}
          websiteName={accountEditor.websiteName}
          revealed={revealed}
          onClose={closeAccountEditor}
          onSave={saveAccount}
          onToggleReveal={toggleReveal}
          onCopyField={copyField}
        />
      ) : null}
      {deleteTarget ? (
        <DeleteConfirmDialog
          target={deleteTarget}
          onClose={closeDeleteDialog}
          onConfirm={confirmDelete}
        />
      ) : null}
    </main>
  )
}
