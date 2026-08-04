import { useEffect, useMemo, useState } from "react"
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Globe2,
  Pencil,
  Plus,
  Trash2,
  UserRound,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type {
  AccountDetail,
  AccountDraft,
  AccountField,
  Category,
  Website,
} from "@/services/vault-client"
import { vaultTextKey } from "@/services/vault-order"

import { PasswordGeneratorButton } from "./PasswordGeneratorButton"
import { accountMatchesSafeFilter, type VaultEntry } from "./VaultTable"

type VaultWorkspaceProps = {
  category: Category | null
  entries: VaultEntry[]
  filterQuery?: string
  selectedWebsiteId: string | null
  selectedAccountId: string | null
  selectedWebsiteIds: Set<string>
  revealed: Record<string, string>
  onSelectWebsite: (websiteId: string | null, accountId?: string | null) => void
  onSelectAccount: (accountId: string) => void
  onCreateWebsite: () => void
  onEditWebsite: (website: Website) => void
  onDeleteWebsite: (website: Website) => void
  onWebsiteSelectionChange: (websiteIds: Set<string>) => void
  onDeleteSelectedWebsites: (websiteIds: string[]) => void
  onSaveAccount: (draft: AccountDraft) => Promise<void>
  onEditAccount: (account: AccountDetail, website: Website) => void
  onDeleteAccount: (account: AccountDetail) => void
  onOpenWebsite: (website: Website) => Promise<void>
  onToggleReveal: (fieldId: string, label: string) => Promise<void>
  onCopyField: (fieldId: string, label: string) => Promise<void>
}

type WebsiteGroup = {
  website: Website
  accounts: AccountDetail[]
}

function systemField(account: AccountDetail, role: "username" | "password") {
  if (role === "username") {
    return account.fields.find((field) => field.systemRole === "username") ?? null
  }
  return (
    account.fields.find(
      (field) => field.systemRole === "password" || field.fieldType === "password",
    ) ?? null
  )
}

function safeFieldValue(field: AccountField | null, revealed: Record<string, string>) {
  if (!field) return "未设置"
  if (field.isSensitive) return revealed[field.id] ?? "已保存，默认隐藏"
  return field.value || "未设置"
}

function QuickAccountForm({
  website,
  onCancel,
  onSave,
}: {
  website: Website
  onCancel: () => void
  onSave: (draft: AccountDraft) => Promise<void>
}) {
  const [displayName, setDisplayName] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  async function save() {
    if (!displayName.trim() || !username.trim() || !password) {
      setError("请填写账号名称、用户名和密码。")
      return
    }
    setPending(true)
    setError("")
    try {
      await onSave({
        websiteId: website.id,
        displayName,
        fields: [
          {
            systemRole: "username",
            label: "用户名",
            fieldType: "text",
            value: username,
            keepExistingValue: false,
            isSensitive: false,
          },
          {
            systemRole: "password",
            label: "密码",
            fieldType: "password",
            value: password,
            keepExistingValue: false,
            isSensitive: true,
          },
        ],
      })
      onCancel()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败，请重试。")
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="quick-account-form" aria-label={`为 ${website.name} 添加账号`}>
      <header>
        <div>
          <strong>添加账号</strong>
          <span>先保存基础登录信息，随后可在详情中补充邮箱、备注和自定义字段。</span>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="取消添加账号" onClick={onCancel}>
          <X />
        </Button>
      </header>
      <div className="quick-account-fields">
        <Field>
          <FieldLabel htmlFor="quick-account-name">账号名称</FieldLabel>
          <Input id="quick-account-name" autoFocus value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="例如：工作账号" />
        </Field>
        <Field>
          <FieldLabel htmlFor="quick-account-username">用户名</FieldLabel>
          <Input id="quick-account-username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="用户名或邮箱" />
        </Field>
        <Field>
          <FieldLabel htmlFor="quick-account-password">密码</FieldLabel>
          <div className="quick-password-field">
            <Input id="quick-account-password" type={passwordVisible ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="输入密码" />
            <Button type="button" variant="ghost" size="icon-sm" aria-label={passwordVisible ? "隐藏新密码" : "显示新密码"} onClick={() => setPasswordVisible((current) => !current)}>
              {passwordVisible ? <EyeOff /> : <Eye />}
            </Button>
            <PasswordGeneratorButton onGenerated={(value) => setPassword(value)} />
          </div>
        </Field>
      </div>
      {error ? <p className="quick-account-error" role="alert">{error}</p> : null}
      <footer>
        <Button type="button" variant="outline" onClick={onCancel}>取消</Button>
        <Button type="button" disabled={pending} onClick={() => void save()}>
          <Check data-icon="inline-start" />
          {pending ? "正在保存…" : "保存账号"}
        </Button>
      </footer>
    </section>
  )
}

export function VaultWorkspace({
  category,
  entries,
  filterQuery = "",
  selectedWebsiteId,
  selectedAccountId,
  selectedWebsiteIds,
  revealed,
  onSelectWebsite,
  onSelectAccount,
  onCreateWebsite,
  onEditWebsite,
  onDeleteWebsite,
  onWebsiteSelectionChange,
  onDeleteSelectedWebsites,
  onSaveAccount,
  onEditAccount,
  onDeleteAccount,
  onOpenWebsite,
  onToggleReveal,
  onCopyField,
}: VaultWorkspaceProps) {
  const [addingAccount, setAddingAccount] = useState(false)
  const queryKey = vaultTextKey(filterQuery)
  const groups = useMemo(() => {
    const grouped = new Map<string, WebsiteGroup>()
    for (const entry of entries) {
      const group = grouped.get(entry.website.id) ?? {
        website: entry.website,
        accounts: [],
      }
      if (entry.account) group.accounts.push(entry.account)
      grouped.set(entry.website.id, group)
    }
    return [...grouped.values()].filter(
      ({ website, accounts }) =>
        !queryKey ||
        vaultTextKey(website.name).includes(queryKey) ||
        accounts.some((account) => accountMatchesSafeFilter(account, queryKey)),
    )
  }, [entries, queryKey])

  const selectedGroup = groups.find(({ website }) => website.id === selectedWebsiteId) ?? null
  const visibleAccounts = selectedGroup
    ? selectedGroup.accounts.filter(
        (account) => !queryKey || accountMatchesSafeFilter(account, queryKey),
      )
    : []
  const selectedAccount =
    visibleAccounts.find((account) => account.id === selectedAccountId) ??
    visibleAccounts[0] ??
    null

  useEffect(() => {
    setAddingAccount(false)
  }, [selectedWebsiteId])

  if (!category) {
    return (
      <section className="vault-workspace-empty" aria-label="保险库内容">
        <Globe2 aria-hidden="true" />
        <h1>先创建一个分类</h1>
        <p>分类会显示在左侧导航，用来整理网站和账号。</p>
      </section>
    )
  }

  const selectedVisibleIds = groups
    .map(({ website }) => website.id)
    .filter((id) => selectedWebsiteIds.has(id))
  const totalAccounts = entries.filter((entry) => entry.account).length

  function setWebsiteSelected(websiteId: string, checked: boolean) {
    const next = new Set(selectedWebsiteIds)
    if (checked) next.add(websiteId)
    else next.delete(websiteId)
    onWebsiteSelectionChange(next)
  }

  return (
    <section className={cn("vault-workspace", selectedGroup && "mobile-account-active")} aria-label={`${category.name}中的账号`}>
      <section className="website-panel" aria-label="网站列表">
        <header className="panel-header">
          <div>
            <h1>网站</h1>
            <span>{category.name} · {groups.length} 个网站 · {totalAccounts} 个账号</span>
          </div>
          <Button type="button" variant="outline" onClick={onCreateWebsite}>
            <Plus data-icon="inline-start" /> 添加网站
          </Button>
        </header>

        {selectedVisibleIds.length > 0 ? (
          <div className="website-bulk-actions">
            <span>已选择 {selectedVisibleIds.length} 个网站</span>
            <Button type="button" variant="destructive" size="sm" onClick={() => onDeleteSelectedWebsites(selectedVisibleIds)}>
              <Trash2 data-icon="inline-start" /> 删除所选
            </Button>
          </div>
        ) : null}

        <div className="website-list">
          {groups.map(({ website, accounts }) => {
            const selected = website.id === selectedWebsiteId
            return (
              <article key={website.id} className={cn("website-list-item", selected && "website-list-item-active")}>
                <Checkbox
                  checked={selectedWebsiteIds.has(website.id)}
                  aria-label={`选择网站 ${website.name}`}
                  onCheckedChange={(checked) => setWebsiteSelected(website.id, checked === true)}
                />
                <button type="button" className="website-list-select" aria-current={selected ? "true" : undefined} onClick={() => onSelectWebsite(website.id, accounts[0]?.id ?? null)}>
                  <span className="website-list-icon"><Globe2 aria-hidden="true" /></span>
                  <span>
                    <strong>{website.name}</strong>
                    <small>{website.primaryUrl ?? "未设置网址"}</small>
                  </span>
                  <small>{accounts.length}</small>
                </button>
              </article>
            )
          })}
          {groups.length === 0 ? (
            <div className="panel-empty">
              <Globe2 aria-hidden="true" />
              <strong>{queryKey ? "没有匹配的网站" : "这个分类还没有网站"}</strong>
              <p>{queryKey ? "密码、备注和敏感字段不会参与筛选。" : "添加网站后，就可以继续保存账号。"}</p>
              {!queryKey ? <Button type="button" variant="outline" onClick={onCreateWebsite}><Plus data-icon="inline-start" /> 添加网站</Button> : null}
            </div>
          ) : null}
        </div>
      </section>

      <section className="account-panel" aria-label="账号工作区">
        {selectedGroup ? (
          <>
            <header className="account-panel-header">
              <Button type="button" variant="ghost" size="icon-sm" className="mobile-back-button" aria-label="返回网站列表" onClick={() => onSelectWebsite(null, null)}>
                <ArrowLeft />
              </Button>
              <div>
                <div className="account-website-title">
                  <h2>{selectedGroup.website.name}</h2>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="打开网站" disabled={!selectedGroup.website.primaryUrl} onClick={() => void onOpenWebsite(selectedGroup.website)}>
                    <ExternalLink />
                  </Button>
                </div>
                {selectedGroup.website.primaryUrl ? (
                  <a href={selectedGroup.website.primaryUrl} onClick={(event) => { event.preventDefault(); void onOpenWebsite(selectedGroup.website) }}>
                    {selectedGroup.website.primaryUrl}
                  </a>
                ) : <span className="account-website-url-empty">未设置网址</span>}
              </div>
              <div className="account-website-actions">
                <Button type="button" variant="outline" size="icon-sm" aria-label="编辑网站" onClick={() => onEditWebsite(selectedGroup.website)}><Pencil /></Button>
                <Button type="button" variant="ghost" size="icon-sm" className="vault-delete-action" aria-label="删除网站" onClick={() => onDeleteWebsite(selectedGroup.website)}><Trash2 /></Button>
                <Button type="button" onClick={() => setAddingAccount(true)}><Plus data-icon="inline-start" /> 添加账号</Button>
              </div>
            </header>

            {addingAccount ? (
              <QuickAccountForm website={selectedGroup.website} onCancel={() => setAddingAccount(false)} onSave={onSaveAccount} />
            ) : (
              <>
                <div className="account-list-heading"><span>账号</span><small>{visibleAccounts.length}</small></div>
                <div className="account-list">
                  {visibleAccounts.map((account) => {
                    const username = systemField(account, "username")
                    const password = systemField(account, "password")
                    const active = account.id === selectedAccount?.id
                    return (
                      <article key={account.id} className={cn("account-list-item", active && "account-list-item-active")}>
                        <button type="button" className="account-list-select" aria-current={active ? "true" : undefined} onClick={() => onSelectAccount(account.id)}>
                          <span className="account-list-icon"><UserRound aria-hidden="true" /></span>
                          <strong>{account.displayName}</strong>
                          <span>{safeFieldValue(username, revealed)}</span>
                          <small>{password ? "密码已保存" : "未设置密码"}</small>
                        </button>
                        <div className="account-list-actions">
                          {username ? <Button type="button" variant="outline" size="icon-sm" aria-label={`复制 ${account.displayName} 的用户名`} onClick={() => void onCopyField(username.id, username.label)}><Copy /></Button> : null}
                          {password ? <Button type="button" variant="outline" size="icon-sm" aria-label={`${revealed[password.id] ? "隐藏" : "显示"} ${account.displayName} 的密码`} onClick={() => void onToggleReveal(password.id, password.label)}>{revealed[password.id] ? <EyeOff /> : <Eye />}</Button> : null}
                          <Button type="button" variant="outline" size="icon-sm" aria-label="编辑账号详情" title={`编辑 ${account.displayName}`} onClick={() => onEditAccount(account, selectedGroup.website)}><Pencil /></Button>
                        </div>
                      </article>
                    )
                  })}
                  {visibleAccounts.length === 0 ? (
                    <div className="panel-empty account-list-empty">
                      <UserRound aria-hidden="true" />
                      <strong>{queryKey ? "没有匹配的账号" : "这个网站还没有账号"}</strong>
                      <p>{queryKey ? "请尝试账号名称、用户名或主邮箱。" : "添加第一个账号以保存登录信息。"}</p>
                      {!queryKey ? <Button type="button" variant="outline" onClick={() => setAddingAccount(true)}><Plus data-icon="inline-start" /> 添加账号</Button> : null}
                    </div>
                  ) : null}
                </div>

                {selectedAccount ? (
                  <section className="account-summary-card" aria-label={`${selectedAccount.displayName}的账号详情`}>
                    <header><h3>账号详情</h3><Button type="button" variant="outline" onClick={() => onEditAccount(selectedAccount, selectedGroup.website)}><Pencil data-icon="inline-start" /> 编辑账号</Button></header>
                    <div className="account-summary-fields">
                      {[
                        { label: "账号", field: null, value: selectedAccount.displayName },
                        { label: "用户名或邮箱", field: systemField(selectedAccount, "username"), value: null },
                        { label: "密码", field: systemField(selectedAccount, "password"), value: null },
                        ...selectedAccount.fields.filter((field) => field.systemRole === "email" || field.systemRole === "note" || field.systemRole === null).map((field) => ({ label: field.label, field, value: null })),
                      ].map(({ label, field, value }) => (
                        <div key={`${label}-${field?.id ?? "display"}`}>
                          <span>{label}</span>
                          <strong>{value ?? safeFieldValue(field, revealed)}</strong>
                          <div>
                            {field ? <Button type="button" variant="ghost" size="icon-sm" aria-label={`复制${label}`} onClick={() => void onCopyField(field.id, field.label)}><Copy /></Button> : null}
                            {field?.isSensitive ? <Button type="button" variant="ghost" size="icon-sm" aria-label={`${revealed[field.id] ? "隐藏" : "显示"}${label}`} onClick={() => void onToggleReveal(field.id, field.label)}>{revealed[field.id] ? <EyeOff /> : <Eye />}</Button> : null}
                          </div>
                        </div>
                      ))}
                      <div>
                        <span>网站</span>
                        <strong>{selectedGroup.website.primaryUrl ?? "未设置网址"}</strong>
                        <div><Button type="button" variant="ghost" size="icon-sm" aria-label="打开当前网站" disabled={!selectedGroup.website.primaryUrl} onClick={() => void onOpenWebsite(selectedGroup.website)}><ExternalLink /></Button></div>
                      </div>
                    </div>
                    <footer><Button type="button" variant="ghost" className="vault-delete-action" onClick={() => onDeleteAccount(selectedAccount)}><Trash2 data-icon="inline-start" /> 删除账号</Button></footer>
                  </section>
                ) : null}
              </>
            )}
          </>
        ) : (
          <div className="panel-empty account-panel-empty">
            <Globe2 aria-hidden="true" />
            <strong>选择一个网站</strong>
            <p>账号列表和详情会显示在这里。</p>
          </div>
        )}
      </section>
    </section>
  )
}
