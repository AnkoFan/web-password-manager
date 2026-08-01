import {
  Copy,
  Eye,
  EyeOff,
  Globe2,
  Pencil,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type {
  AccountDetail,
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
  revealed: Record<string, string>
  onCreateWebsite: () => void
  onEditWebsite: (website: Website) => void
  onDeleteWebsite: (website: Website) => void
  onCreateAccount: (website: Website) => void
  onEditAccount: (website: Website, account: AccountDetail) => void
  onDeleteAccount: (account: AccountDetail) => void
  onToggleReveal: (fieldId: string, label: string) => Promise<void>
  onCopyField: (fieldId: string, label: string) => Promise<void>
}

function PasswordCell({
  account,
  revealed,
  onToggleReveal,
  onCopyField,
}: Pick<
  VaultTableProps,
  "revealed" | "onToggleReveal" | "onCopyField"
> & { account: AccountDetail | null }) {
  const passwordField = account?.fields.find(
    (field) => field.systemRole === "password" || field.fieldType === "password",
  )

  if (!passwordField) {
    return <span className="vault-cell-placeholder">未设置</span>
  }

  const visibleValue = revealed[passwordField.id]

  return (
    <div className="vault-password-cell">
      <code className={cn("vault-password-value", !visibleValue && "masked")}>
        {visibleValue ?? "••••••••••••"}
      </code>
      <div className="vault-inline-actions">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={visibleValue ? "隐藏密码" : "显示密码"}
              onClick={() => void onToggleReveal(passwordField.id, passwordField.label)}
            >
              {visibleValue ? <EyeOff /> : <Eye />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{visibleValue ? "隐藏密码" : "临时显示密码"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="复制密码"
              onClick={() => void onCopyField(passwordField.id, passwordField.label)}
            >
              <Copy />
            </Button>
          </TooltipTrigger>
          <TooltipContent>复制密码</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

export function VaultTable({
  category,
  entries,
  selectedAccountId,
  revealed,
  onCreateWebsite,
  onEditWebsite,
  onDeleteWebsite,
  onCreateAccount,
  onEditAccount,
  onDeleteAccount,
  onToggleReveal,
  onCopyField,
}: VaultTableProps) {
  if (!category) {
    return (
      <section className="vault-table-empty" aria-label="保险库内容">
        <Globe2 aria-hidden="true" />
        <h1>先创建一个分类</h1>
        <p>分类会显示在左侧栏，用来整理网站和账号。</p>
      </section>
    )
  }

  return (
    <section className="vault-table-view" aria-label={`${category.name}中的账号`}>
      <header className="vault-table-toolbar">
        <div>
          <p>当前分类</p>
          <h1>{category.name}</h1>
          <span>{entries.filter((entry) => entry.account).length} 个账号</span>
        </div>
        <Button type="button" onClick={onCreateWebsite}>
          <Plus data-icon="inline-start" />
          添加网站
        </Button>
      </header>

      {entries.length === 0 ? (
        <div className="vault-table-empty vault-table-empty-bordered">
          <Globe2 aria-hidden="true" />
          <h2>这个分类还没有网站</h2>
          <p>添加网站后，可以继续创建一个或多个账号。</p>
          <Button type="button" variant="outline" onClick={onCreateWebsite}>
            <Plus data-icon="inline-start" />
            添加网站
          </Button>
        </div>
      ) : (
        <div className="vault-table-frame">
          <table className="vault-table">
            <thead>
              <tr>
                <th scope="col">网站</th>
                <th scope="col">账号</th>
                <th scope="col">密码</th>
                <th scope="col" className="vault-actions-heading">操作</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(({ website, account }, index) => {
                const previousWebsiteId = entries[index - 1]?.website.id
                const firstWebsiteRow = previousWebsiteId !== website.id

                return (
                  <tr
                    key={`${website.id}-${account?.id ?? "empty"}`}
                    className={cn(
                      account?.id === selectedAccountId && "vault-row-selected",
                    )}
                  >
                    <td data-label="网站">
                      {firstWebsiteRow ? (
                        <div className="vault-website-cell">
                          <span className="vault-row-icon">
                            <Globe2 aria-hidden="true" />
                          </span>
                          <span>
                            <strong>{website.name}</strong>
                            <small>{website.primaryUrl ?? "未设置网址"}</small>
                          </span>
                          <div className="vault-inline-actions website-row-actions">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`编辑网站 ${website.name}`}
                              onClick={() => onEditWebsite(website)}
                            >
                              <Pencil />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`删除网站 ${website.name}`}
                              onClick={() => onDeleteWebsite(website)}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <span className="vault-same-site">同上</span>
                      )}
                    </td>
                    <td data-label="账号">
                      {account ? (
                        <div className="vault-account-cell">
                          <span className="vault-row-icon vault-row-icon-muted">
                            <UserRound aria-hidden="true" />
                          </span>
                          <strong>{account.displayName}</strong>
                        </div>
                      ) : (
                        <span className="vault-cell-placeholder">尚未添加账号</span>
                      )}
                    </td>
                    <td data-label="密码">
                      <PasswordCell
                        account={account}
                        revealed={revealed}
                        onToggleReveal={onToggleReveal}
                        onCopyField={onCopyField}
                      />
                    </td>
                    <td data-label="操作">
                      <div className="vault-row-actions">
                        {account ? (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => onEditAccount(website, account)}
                            >
                              <Pencil data-icon="inline-start" />
                              编辑
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="vault-delete-action"
                              onClick={() => onDeleteAccount(account)}
                            >
                              <Trash2 data-icon="inline-start" />
                              删除
                            </Button>
                          </>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onCreateAccount(website)}
                          >
                            <Plus data-icon="inline-start" />
                            添加账号
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
