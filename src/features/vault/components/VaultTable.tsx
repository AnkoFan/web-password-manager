import { useEffect, useMemo, useState } from "react"
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  Globe2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type {
  AccountDetail,
  AccountDraft,
  AccountField,
  AccountFieldDraft,
  Category,
  Website,
} from "@/services/vault-client"

export type VaultEntry = {
  website: Website
  account: AccountDetail | null
}

type VaultTableProps = {
  category: Category | null
  entries: VaultEntry[]
  selectedAccountId: string | null
  selectedWebsiteIds: Set<string>
  revealed: Record<string, string>
  onCreateWebsite: () => void
  onEditWebsite: (website: Website) => void
  onDeleteWebsite: (website: Website) => void
  onWebsiteSelectionChange: (websiteIds: Set<string>) => void
  onDeleteSelectedWebsites: (websiteIds: string[]) => void
  onSaveAccount: (draft: AccountDraft) => Promise<void>
  onDeleteAccount: (account: AccountDetail) => void
  onOpenWebsite: (website: Website) => Promise<void>
  onToggleReveal: (fieldId: string, label: string) => Promise<void>
  onCopyField: (fieldId: string, label: string) => Promise<void>
}

type WebsiteGroup = {
  website: Website
  accounts: AccountDetail[]
}

function systemField(account: AccountDetail | null, role: "username" | "password") {
  if (role === "username") {
    return account?.fields.find((field) => field.systemRole === "username")
      ?? account?.fields.find((field) => field.systemRole === "email")
      ?? null
  }
  return account?.fields.find(
    (field) => field.systemRole === "password" || field.fieldType === "password",
  ) ?? null
}

function preservedField(field: AccountField): AccountFieldDraft {
  return {
    id: field.id,
    systemRole: field.systemRole,
    label: field.label,
    fieldType: field.fieldType,
    value: field.isSensitive ? null : (field.value ?? ""),
    keepExistingValue: field.isSensitive,
    isSensitive: field.isSensitive,
  }
}

type InlineAccountRowProps = Pick<
  VaultTableProps,
  | "revealed"
  | "onSaveAccount"
  | "onDeleteAccount"
  | "onOpenWebsite"
  | "onToggleReveal"
  | "onCopyField"
> & {
  website: Website
  account: AccountDetail | null
  firstWebsiteRow: boolean
  hidden: boolean
  selected: boolean
  websiteSelected: boolean
  additionalRowCount: number
  rowsExpanded: boolean
  onAddRow: () => void
  onToggleRows: () => void
  onEditWebsite: (website: Website) => void
  onDeleteWebsite: (website: Website) => void
  onWebsiteSelectedChange: (websiteId: string, selected: boolean) => void
  onRemoveDraft?: () => void
}

function InlineAccountRow({
  website,
  account,
  firstWebsiteRow,
  hidden,
  selected,
  websiteSelected,
  additionalRowCount,
  rowsExpanded,
  revealed,
  onSaveAccount,
  onDeleteAccount,
  onOpenWebsite,
  onToggleReveal,
  onCopyField,
  onAddRow,
  onToggleRows,
  onEditWebsite,
  onDeleteWebsite,
  onWebsiteSelectedChange,
  onRemoveDraft,
}: InlineAccountRowProps) {
  const usernameField = systemField(account, "username")
  const passwordField = systemField(account, "password")
  const [name, setName] = useState(account?.displayName ?? "")
  const [username, setUsername] = useState(usernameField?.value ?? "")
  const [password, setPassword] = useState("")
  const [usernameDirty, setUsernameDirty] = useState(false)
  const [passwordDirty, setPasswordDirty] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  const revealedUsername = usernameField ? revealed[usernameField.id] : undefined
  const revealedPassword = passwordField ? revealed[passwordField.id] : undefined
  const usernameValue = usernameDirty ? username : (revealedUsername ?? username)
  const passwordValue = passwordDirty ? password : (revealedPassword ?? "")
  const passwordVisible = passwordDirty ? showNewPassword : Boolean(revealedPassword)

  async function save() {
    if (!name.trim() || !usernameValue.trim() || (!passwordField && !passwordValue)) {
      setError("请填写名称、账号和密码。")
      return
    }

    const fields = account ? account.fields.map(preservedField) : []
    const usernameIndex = usernameField
      ? fields.findIndex((field) => field.id === usernameField.id)
      : -1
    const passwordIndex = passwordField
      ? fields.findIndex((field) => field.id === passwordField.id)
      : -1

    const nextUsername: AccountFieldDraft = {
      id: usernameField?.id,
      systemRole: usernameField?.systemRole ?? "username",
      label: usernameField?.label ?? "用户名",
      fieldType: usernameField?.fieldType ?? "text",
      value: usernameDirty || !account ? usernameValue : usernameField?.isSensitive ? null : usernameValue,
      keepExistingValue: Boolean(account && usernameField?.isSensitive && !usernameDirty),
      isSensitive: usernameField?.isSensitive ?? false,
    }
    const nextPassword: AccountFieldDraft = {
      id: passwordField?.id,
      systemRole: "password",
      label: passwordField?.label ?? "密码",
      fieldType: "password",
      value: passwordDirty || !account ? passwordValue : null,
      keepExistingValue: Boolean(account && passwordField && !passwordDirty),
      isSensitive: true,
    }

    if (usernameIndex >= 0) fields[usernameIndex] = nextUsername
    else fields.push(nextUsername)
    if (passwordIndex >= 0) fields[passwordIndex] = nextPassword
    else fields.push(nextPassword)

    setPending(true)
    setError("")
    try {
      await onSaveAccount({
        id: account?.id,
        websiteId: website.id,
        displayName: name,
        fields,
      })
      onRemoveDraft?.()
      setUsernameDirty(false)
      setPasswordDirty(false)
      setPassword("")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败，请重试。")
    } finally {
      setPending(false)
    }
  }

  async function togglePassword() {
    if (passwordDirty || !passwordField) {
      setShowNewPassword((current) => !current)
      return
    }
    await onToggleReveal(passwordField.id, passwordField.label)
  }

  return (
    <tr hidden={hidden} className={cn((selected || websiteSelected) && "vault-row-selected", error && "vault-row-error")}>
      <td data-label="网站">
        {firstWebsiteRow ? (
          <div className="vault-website-cell">
            <Checkbox
              checked={websiteSelected}
              aria-label={`选择网站 ${website.name}`}
              onCheckedChange={(checked) =>
                onWebsiteSelectedChange(website.id, checked === true)
              }
            />
            <span className="vault-row-icon">
              <Globe2 aria-hidden="true" />
            </span>
            <span className="vault-website-meta">
              <span className="vault-website-title-row">
                <strong title={website.name}>{website.name}</strong>
                <span className="vault-website-title-actions">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`编辑网站 ${website.name}`}
                    title={`编辑网站 ${website.name}`}
                    onClick={() => onEditWebsite(website)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="vault-website-delete-button"
                    aria-label={`删除网站 ${website.name}`}
                    title={`删除网站 ${website.name}`}
                    onClick={() => onDeleteWebsite(website)}
                  >
                    <Trash2 />
                  </Button>
                </span>
              </span>
              <small>{website.primaryUrl ?? "未设置网址"}</small>
              <span className="vault-site-account-controls">
                <button type="button" className="vault-site-add-account" onClick={onAddRow}>
                  <Plus aria-hidden="true" /> 添加账号
                </button>
                {additionalRowCount > 0 ? (
                  <button
                    type="button"
                    className="vault-site-toggle-accounts"
                    aria-label={`${rowsExpanded ? "收起" : "展开"}其余 ${additionalRowCount} 个账号`}
                    aria-expanded={rowsExpanded}
                    title={`${rowsExpanded ? "收起" : "展开"}其余 ${additionalRowCount} 个账号`}
                    onClick={onToggleRows}
                  >
                    {rowsExpanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
                    <span aria-hidden="true">{additionalRowCount}</span>
                  </button>
                ) : null}
              </span>
            </span>
          </div>
        ) : null}
      </td>
      <td data-label="名称">
        <Input
          aria-label={`${website.name} 的账号名称`}
          placeholder="例如：工作账号"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </td>
      <td data-label="账号">
        <div className="vault-inline-field">
          <Input
            aria-label={`${website.name} 的登录账号`}
            placeholder={usernameField?.isSensitive && !revealedUsername ? "已保存（输入新账号替换）" : "用户名或邮箱"}
            value={usernameValue}
            onChange={(event) => {
              setUsername(event.target.value)
              setUsernameDirty(true)
            }}
          />
          {account && usernameField ? (
            <Button type="button" variant="ghost" size="icon-sm" aria-label="复制账号" onClick={() => void onCopyField(usernameField.id, usernameField.label)}>
              <Copy />
            </Button>
          ) : null}
        </div>
      </td>
      <td data-label="密码">
        <div className="vault-inline-field">
          <Input
            aria-label={`${website.name} 的密码`}
            type={passwordVisible ? "text" : "password"}
            placeholder={account && passwordField ? "已保存（输入新密码替换）" : "输入密码"}
            value={passwordValue}
            onChange={(event) => {
              setPassword(event.target.value)
              setPasswordDirty(true)
            }}
          />
          <Button type="button" variant="ghost" size="icon-sm" aria-label={passwordVisible ? "隐藏密码" : "显示密码"} onClick={() => void togglePassword()}>
            {passwordVisible ? <EyeOff /> : <Eye />}
          </Button>
          {account && passwordField ? (
            <Button type="button" variant="ghost" size="icon-sm" aria-label="复制密码" onClick={() => void onCopyField(passwordField.id, passwordField.label)}>
              <Copy />
            </Button>
          ) : null}
        </div>
      </td>
      <td data-label="操作">
        <div className="vault-row-actions">
          <Button type="button" size="sm" disabled={pending} onClick={() => void save()}>
            <Check data-icon="inline-start" />
            {pending ? "保存中…" : "保存"}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!website.primaryUrl} onClick={() => void onOpenWebsite(website)}>
            <ExternalLink data-icon="inline-start" />
            打开网址
          </Button>
          {account ? (
            <Button type="button" variant="ghost" size="sm" className="vault-delete-action" onClick={() => onDeleteAccount(account)}>
              <Trash2 data-icon="inline-start" /> 删除
            </Button>
          ) : onRemoveDraft ? (
            <Button type="button" variant="ghost" size="sm" onClick={onRemoveDraft}>
              <X data-icon="inline-start" /> 取消
            </Button>
          ) : null}
        </div>
        {error ? <p className="vault-row-error-message">{error}</p> : null}
      </td>
    </tr>
  )
}

export function VaultTable({
  category,
  entries,
  selectedAccountId,
  selectedWebsiteIds,
  revealed,
  onCreateWebsite,
  onEditWebsite,
  onDeleteWebsite,
  onWebsiteSelectionChange,
  onDeleteSelectedWebsites,
  onSaveAccount,
  onDeleteAccount,
  onOpenWebsite,
  onToggleReveal,
  onCopyField,
}: VaultTableProps) {
  const [draftRows, setDraftRows] = useState<Record<string, string[]>>({})
  const [expandedWebsites, setExpandedWebsites] = useState<Set<string>>(() => new Set())
  const groups = useMemo(() => {
    const grouped = new Map<string, WebsiteGroup>()
    for (const entry of entries) {
      const group = grouped.get(entry.website.id) ?? { website: entry.website, accounts: [] }
      if (entry.account) group.accounts.push(entry.account)
      grouped.set(entry.website.id, group)
    }
    return [...grouped.values()]
  }, [entries])

  useEffect(() => {
    if (!selectedAccountId) return
    const selectedGroup = groups.find(({ accounts }) =>
      accounts.some((account) => account.id === selectedAccountId),
    )
    if (!selectedGroup || selectedGroup.accounts[0]?.id === selectedAccountId) return
    setExpandedWebsites((current) => {
      if (current.has(selectedGroup.website.id)) return current
      const next = new Set(current)
      next.add(selectedGroup.website.id)
      return next
    })
  }, [groups, selectedAccountId])

  function addDraftRow(websiteId: string) {
    setDraftRows((current) => ({
      ...current,
      [websiteId]: [...(current[websiteId] ?? []), crypto.randomUUID()],
    }))
    setExpandedWebsites((current) => {
      const next = new Set(current)
      next.add(websiteId)
      return next
    })
  }

  function toggleWebsiteRows(websiteId: string) {
    setExpandedWebsites((current) => {
      const next = new Set(current)
      if (next.has(websiteId)) next.delete(websiteId)
      else next.add(websiteId)
      return next
    })
  }

  function removeDraftRow(websiteId: string, rowId: string) {
    setDraftRows((current) => ({
      ...current,
      [websiteId]: (current[websiteId] ?? []).filter((id) => id !== rowId),
    }))
  }

  function setWebsiteSelected(websiteId: string, selected: boolean) {
    const next = new Set(selectedWebsiteIds)
    if (selected) next.add(websiteId)
    else next.delete(websiteId)
    onWebsiteSelectionChange(next)
  }

  if (!category) {
    return (
      <section className="vault-table-empty" aria-label="保险库内容">
        <Globe2 aria-hidden="true" />
        <h1>先创建一个分类</h1>
        <p>分类会显示在左侧栏，用来整理网站和账号。</p>
      </section>
    )
  }

  const accountCount = entries.filter((entry) => entry.account).length
  const selectedCount = groups.filter(({ website }) => selectedWebsiteIds.has(website.id)).length
  const allWebsitesSelected = groups.length > 0 && selectedCount === groups.length
  const someWebsitesSelected = selectedCount > 0 && !allWebsitesSelected

  return (
    <section className="vault-table-view" aria-label={`${category.name}中的账号`}>
      <header className="vault-table-toolbar">
        <div>
          <p>当前分类</p>
          <h1>{category.name}</h1>
          <span>{accountCount} 个账号</span>
        </div>
        <div className="vault-table-toolbar-actions">
          {selectedCount > 0 ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() =>
                onDeleteSelectedWebsites(
                  groups
                    .map(({ website }) => website.id)
                    .filter((websiteId) => selectedWebsiteIds.has(websiteId)),
                )
              }
            >
              <Trash2 data-icon="inline-start" /> 删除选中（{selectedCount}）
            </Button>
          ) : null}
          <Button type="button" onClick={onCreateWebsite}>
            <Plus data-icon="inline-start" /> 添加网站
          </Button>
        </div>
      </header>

      {entries.length === 0 ? (
        <div className="vault-table-empty vault-table-empty-bordered">
          <Globe2 aria-hidden="true" />
          <h2>这个分类还没有网站</h2>
          <p>添加网站后，可以直接在表格中填写一个或多个账号。</p>
          <Button type="button" variant="outline" onClick={onCreateWebsite}>
            <Plus data-icon="inline-start" /> 添加网站
          </Button>
        </div>
      ) : (
        <div className="vault-table-frame">
          <table className="vault-table">
            <thead>
              <tr>
                <th scope="col">
                  <div className="vault-select-all">
                    <Checkbox
                      checked={allWebsitesSelected ? true : someWebsitesSelected ? "indeterminate" : false}
                      aria-label="选择当前分类中的全部网站"
                      onCheckedChange={(checked) =>
                        onWebsiteSelectionChange(
                          checked === true
                            ? new Set(groups.map(({ website }) => website.id))
                            : new Set(),
                        )
                      }
                    />
                    <span>网站</span>
                  </div>
                </th>
                <th scope="col">名称</th>
                <th scope="col">账号</th>
                <th scope="col">密码</th>
                <th scope="col" className="vault-actions-heading">操作</th>
              </tr>
            </thead>
            <tbody>
              {groups.flatMap(({ website, accounts }) => {
                const automaticEmptyRow = accounts.length === 0
                const rows: Array<{ key: string; account: AccountDetail | null; removable?: boolean }> = [
                  ...accounts.map((account) => ({ key: account.id, account })),
                  ...(automaticEmptyRow ? [{ key: `empty-${website.id}`, account: null }] : []),
                  ...(draftRows[website.id] ?? []).map((key) => ({ key, account: null, removable: true })),
                ]
                const additionalRowCount = Math.max(0, rows.length - 1)
                const rowsExpanded = expandedWebsites.has(website.id)
                return rows.map((row, index) => (
                  <InlineAccountRow
                    key={row.key}
                    website={website}
                    account={row.account}
                    firstWebsiteRow={index === 0}
                    selected={row.account?.id === selectedAccountId}
                    websiteSelected={selectedWebsiteIds.has(website.id)}
                    additionalRowCount={additionalRowCount}
                    rowsExpanded={rowsExpanded}
                    revealed={revealed}
                    onSaveAccount={onSaveAccount}
                    onDeleteAccount={onDeleteAccount}
                    onOpenWebsite={onOpenWebsite}
                    onToggleReveal={onToggleReveal}
                    onCopyField={onCopyField}
                    onAddRow={() => addDraftRow(website.id)}
                    onToggleRows={() => toggleWebsiteRows(website.id)}
                    onEditWebsite={onEditWebsite}
                    onDeleteWebsite={onDeleteWebsite}
                    onWebsiteSelectedChange={setWebsiteSelected}
                    onRemoveDraft={row.removable ? () => removeDraftRow(website.id, row.key) : undefined}
                    hidden={index > 0 && !rowsExpanded}
                  />
                ))
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
