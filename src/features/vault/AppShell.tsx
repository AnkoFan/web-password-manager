import { useEffect, useState } from "react"
import { toast } from "sonner"

import { AccountBrowser } from "./components/AccountBrowser"
import { AccountDetail } from "./components/AccountDetail"
import {
  DeleteConfirmDialog,
  type DeleteTarget,
} from "./components/DeleteConfirmDialog"
import { PrimaryNavigation, type VaultView } from "./components/PrimaryNavigation"
import { SearchResults } from "./components/SearchResults"
import { SecuritySettingsView } from "./components/SecuritySettingsView"
import { TopBar } from "./components/TopBar"
import { TrashView } from "./components/TrashView"
import {
  VaultEditorDialog,
  type EditorState,
} from "./components/VaultEditorDialog"
import { shouldFocusGlobalSearch } from "./keyboard"

import {
  vaultClient,
  type AccountDetail as AccountDetailModel,
  type AccountDraft,
  type AccountSummary,
  type Category,
  type SearchResult,
  type TrashItem,
  type Website,
  type WebsiteDraft,
} from "@/services/vault-client"

type AppShellProps = {
  onLock: (notice?: string) => Promise<void>
}

type PreferredSelection = {
  categoryId?: string | null
  websiteId?: string | null
  accountId?: string | null
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请重试。"
}

export function AppShell({ onLock }: AppShellProps) {
  const [view, setView] = useState<VaultView>("vault")
  const [categories, setCategories] = useState<Category[]>([])
  const [websites, setWebsites] = useState<Website[]>([])
  const [accounts, setAccounts] = useState<AccountSummary[]>([])
  const [account, setAccount] = useState<AccountDetailModel | null>(null)
  const [trashItems, setTrashItems] = useState<TrashItem[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [selectedWebsiteId, setSelectedWebsiteId] = useState<string | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [query, setQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [loading, setLoading] = useState(true)

  async function refresh(preferred: PreferredSelection = {}) {
    const [nextCategories, nextWebsites, nextTrash] = await Promise.all([
      vaultClient.listCategories(),
      vaultClient.listWebsites(),
      vaultClient.listTrash(),
    ])
    setCategories(nextCategories)
    setWebsites(nextWebsites)
    setTrashItems(nextTrash)

    const categoryId =
      preferred.categoryId === null
        ? null
        : nextCategories.some(
              (category) =>
                category.id === (preferred.categoryId ?? selectedCategoryId),
            )
          ? (preferred.categoryId ?? selectedCategoryId)
          : (nextCategories[0]?.id ?? null)
    const categoryWebsites = nextWebsites.filter(
      (website) => website.categoryId === categoryId,
    )
    const websiteId =
      preferred.websiteId === null
        ? null
        : categoryWebsites.some(
              (website) =>
                website.id === (preferred.websiteId ?? selectedWebsiteId),
            )
          ? (preferred.websiteId ?? selectedWebsiteId)
          : (categoryWebsites[0]?.id ?? null)
    const nextAccounts = websiteId ? await vaultClient.listAccounts(websiteId) : []
    const accountId =
      preferred.accountId === null
        ? null
        : nextAccounts.some(
              (entry) =>
                entry.id === (preferred.accountId ?? selectedAccountId),
            )
          ? (preferred.accountId ?? selectedAccountId)
          : (nextAccounts[0]?.id ?? null)
    const nextAccount = accountId ? await vaultClient.getAccount(accountId) : null

    setSelectedCategoryId(categoryId)
    setSelectedWebsiteId(websiteId)
    setSelectedAccountId(accountId)
    setAccounts(nextAccounts)
    setAccount(nextAccount)
    setRevealed({})
  }

  useEffect(() => {
    let active = true
    void refresh()
      .catch((error) => {
        if (active) toast.error("无法读取保险库", { description: errorMessage(error) })
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
    // Initial unlocked-session load only. Subsequent refreshes are mutation-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let lastRecordedAt = 0
    function recordActivity() {
      const now = Date.now()
      if (now - lastRecordedAt < 10_000) return
      lastRecordedAt = now
      void vaultClient.recordActivity().catch(() => {
        // A concurrent native auto-lock event will unmount this shell.
      })
    }
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "focus"]
    for (const event of events) window.addEventListener(event, recordActivity, true)
    return () => {
      for (const event of events) window.removeEventListener(event, recordActivity, true)
    }
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
    if (!trimmed) {
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
          if (active) toast.error("搜索失败", { description: errorMessage(error) })
        })
    }, 180)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [query])

  async function selectCategory(categoryId: string) {
    const website = websites.find((entry) => entry.categoryId === categoryId) ?? null
    setSelectedCategoryId(categoryId)
    setSelectedWebsiteId(website?.id ?? null)
    setSelectedAccountId(null)
    setAccount(null)
    setRevealed({})
    if (!website) {
      setAccounts([])
      return
    }
    try {
      const nextAccounts = await vaultClient.listAccounts(website.id)
      setAccounts(nextAccounts)
      const first = nextAccounts[0]
      if (first) {
        setSelectedAccountId(first.id)
        setAccount(await vaultClient.getAccount(first.id))
      }
    } catch (error) {
      toast.error("无法读取账号", { description: errorMessage(error) })
    }
  }

  async function selectWebsite(websiteId: string) {
    const website = websites.find((entry) => entry.id === websiteId)
    if (!website) return
    setSelectedCategoryId(website.categoryId)
    setSelectedWebsiteId(websiteId)
    setSelectedAccountId(null)
    setAccount(null)
    setRevealed({})
    try {
      const nextAccounts = await vaultClient.listAccounts(websiteId)
      setAccounts(nextAccounts)
      const first = nextAccounts[0]
      if (first) {
        setSelectedAccountId(first.id)
        setAccount(await vaultClient.getAccount(first.id))
      }
    } catch (error) {
      toast.error("无法读取账号", { description: errorMessage(error) })
    }
  }

  async function selectAccount(accountId: string) {
    setSelectedAccountId(accountId)
    setRevealed({})
    try {
      setAccount(await vaultClient.getAccount(accountId))
    } catch (error) {
      toast.error("无法读取账号详情", { description: errorMessage(error) })
    }
  }

  async function saveCategory(id: string | undefined, name: string) {
    if (id) {
      await vaultClient.renameCategory(id, name)
      await refresh({ categoryId: id })
    } else {
      const created = await vaultClient.createCategory(name)
      await refresh({ categoryId: created.id, websiteId: null, accountId: null })
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
    try {
      if (deleteTarget.type === "category") {
        await vaultClient.deleteCategory(deleteTarget.id)
      } else if (deleteTarget.type === "website") {
        await vaultClient.deleteWebsite(deleteTarget.id)
      } else {
        await vaultClient.deleteAccount(deleteTarget.id)
      }
      setDeleteTarget(null)
      await refresh()
      toast.success("已移入回收站")
    } catch (error) {
      toast.error("删除失败", { description: errorMessage(error) })
    }
  }

  async function restore(groupId: string) {
    try {
      await vaultClient.restore(groupId)
      await refresh()
      toast.success("删除批次已恢复")
    } catch (error) {
      toast.error("恢复失败", { description: errorMessage(error) })
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
      toast.success(`已复制${label}`, { description: "通知中不会显示字段内容。" })
    } catch (error) {
      toast.error("复制失败", { description: errorMessage(error) })
    }
  }

  async function selectSearchResult(result: SearchResult) {
    setQuery("")
    setView("vault")
    setSelectedCategoryId(result.categoryId)
    setSelectedWebsiteId(result.websiteId)
    setRevealed({})
    try {
      const nextAccounts = await vaultClient.listAccounts(result.websiteId)
      setAccounts(nextAccounts)
      const accountId = result.accountId ?? nextAccounts[0]?.id ?? null
      setSelectedAccountId(accountId)
      setAccount(accountId ? await vaultClient.getAccount(accountId) : null)
    } catch (error) {
      toast.error("无法定位搜索结果", { description: errorMessage(error) })
    }
  }

  const category =
    categories.find((entry) => entry.id === selectedCategoryId) ?? null
  const website =
    websites.find((entry) => entry.id === selectedWebsiteId) ?? null
  const breadcrumbs =
    view === "trash"
      ? ["回收站"]
      : view === "settings"
        ? ["设置"]
      : ["保险库", category?.name ?? "未选择分类", website?.name ?? "未选择网站"]

  return (
    <main className="vault-app">
      <PrimaryNavigation
        activeView={view}
        onNavigate={(nextView) => {
          setView(nextView)
          setQuery("")
        }}
        onLock={async () => {
          setRevealed({})
          await onLock()
        }}
      />
      <section className="workspace">
        <TopBar
          breadcrumbs={breadcrumbs}
          query={query}
          onQueryChange={setQuery}
          onLock={onLock}
        />
        {loading ? (
          <div className="workspace-loading">正在读取保险库…</div>
        ) : query.trim() ? (
          <SearchResults
            query={query.trim()}
            results={searchResults}
            onSelect={(result) => void selectSearchResult(result)}
          />
        ) : view === "trash" ? (
          <TrashView items={trashItems} onRestore={restore} />
        ) : view === "settings" ? (
          <SecuritySettingsView
            onBackupLocked={() =>
              onLock("加密备份已创建，保险库已安全锁定。")
            }
          />
        ) : (
          <div className="content-grid">
            <AccountBrowser
              categories={categories}
              websites={websites}
              accounts={accounts}
              selectedCategoryId={selectedCategoryId}
              selectedWebsiteId={selectedWebsiteId}
              selectedAccountId={selectedAccountId}
              onSelectCategory={(id) => void selectCategory(id)}
              onSelectWebsite={(id) => void selectWebsite(id)}
              onSelectAccount={(id) => void selectAccount(id)}
              onCreateCategory={() => setEditor({ kind: "category" })}
              onEditCategory={() =>
                category ? setEditor({ kind: "category", category }) : undefined
              }
              onDeleteCategory={() =>
                category
                  ? setDeleteTarget({
                      type: "category",
                      id: category.id,
                      name: category.name,
                      affectedCount: websites.filter(
                        (entry) => entry.categoryId === category.id,
                      ).length,
                    })
                  : undefined
              }
              onCreateWebsite={() =>
                selectedCategoryId
                  ? setEditor({ kind: "website", categoryId: selectedCategoryId })
                  : undefined
              }
              onEditWebsite={() =>
                website
                  ? setEditor({
                      kind: "website",
                      website,
                      categoryId: website.categoryId,
                    })
                  : undefined
              }
              onDeleteWebsite={() =>
                website
                  ? setDeleteTarget({
                      type: "website",
                      id: website.id,
                      name: website.name,
                      affectedCount: accounts.length,
                    })
                  : undefined
              }
              onCreateAccount={() =>
                selectedWebsiteId
                  ? setEditor({ kind: "account", websiteId: selectedWebsiteId })
                  : undefined
              }
            />
            <AccountDetail
              account={account}
              website={website}
              revealed={revealed}
              onCopyField={copyField}
              onToggleReveal={toggleReveal}
              onCopyUrl={async () => {
                if (!website) return
                try {
                  await vaultClient.copyUrl(website.id)
                  toast.success("已复制网址")
                } catch (error) {
                  toast.error("复制网址失败", { description: errorMessage(error) })
                }
              }}
              onOpenWebsite={async () => {
                if (!website) return
                try {
                  await vaultClient.openWebsite(website.id)
                } catch (error) {
                  toast.error("无法打开网址", { description: errorMessage(error) })
                }
              }}
              onEdit={() =>
                account && selectedWebsiteId
                  ? setEditor({
                      kind: "account",
                      account,
                      websiteId: selectedWebsiteId,
                    })
                  : undefined
              }
              onDelete={() =>
                account
                  ? setDeleteTarget({
                      type: "account",
                      id: account.id,
                      name: account.displayName,
                    })
                  : undefined
              }
            />
          </div>
        )}
      </section>

      {editor ? (
        <VaultEditorDialog
          key={`${editor.kind}-${
            editor.kind === "category"
              ? (editor.category?.id ?? "new")
              : editor.kind === "website"
                ? (editor.website?.id ?? "new")
                : (editor.account?.id ?? "new")
          }`}
          editor={editor}
          categories={categories}
          onClose={() => setEditor(null)}
          onSaveCategory={saveCategory}
          onSaveWebsite={saveWebsite}
          onSaveAccount={saveAccount}
        />
      ) : null}
      {deleteTarget ? (
        <DeleteConfirmDialog
          target={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </main>
  )
}
