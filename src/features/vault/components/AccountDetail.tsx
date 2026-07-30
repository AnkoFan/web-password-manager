import {
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Pencil,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { AccountDetail as AccountDetailModel, Website } from "@/services/vault-client"

type AccountDetailProps = {
  account: AccountDetailModel | null
  website: Website | null
  revealed: Record<string, string>
  onCopyField: (fieldId: string, label: string) => Promise<void>
  onToggleReveal: (fieldId: string, label: string) => Promise<void>
  onCopyUrl: () => Promise<void>
  onOpenWebsite: () => Promise<void>
  onEdit: () => void
  onDelete: () => void
}

export function AccountDetail({
  account,
  website,
  revealed,
  onCopyField,
  onToggleReveal,
  onCopyUrl,
  onOpenWebsite,
  onEdit,
  onDelete,
}: AccountDetailProps) {
  if (!account || !website) {
    return (
      <section className="account-detail detail-empty" aria-label="账号详情">
        <span className="detail-empty-icon">
          <KeyRound aria-hidden="true" />
        </span>
        <h2>选择一个账号</h2>
        <p>从左侧选择账号，或先创建分类、网站和账号。</p>
      </section>
    )
  }

  return (
    <section className="account-detail" aria-label="账号详情">
      <header className="detail-header">
        <div className="detail-title">
          <span className="detail-avatar">
            <UserRound aria-hidden="true" />
          </span>
          <div>
            <p>{website.name}</p>
            <h2>{account.displayName}</h2>
          </div>
        </div>
        <div className="detail-actions">
          <Button type="button" variant="outline" onClick={onEdit}>
            <Pencil data-icon="inline-start" />
            编辑账号
          </Button>
          <Button type="button" variant="destructive" onClick={onDelete}>
            <Trash2 data-icon="inline-start" />
            删除账号
          </Button>
        </div>
      </header>

      {website.primaryUrl ? (
        <div className="detail-website-actions">
          <span className="detail-url">{website.primaryUrl}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void onOpenWebsite()}>
            <ExternalLink data-icon="inline-start" />
            打开
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void onCopyUrl()}>
            <Copy data-icon="inline-start" />
            复制网址
          </Button>
        </div>
      ) : null}

      <div className="field-table">
        {account.fields.map((field) => {
          const visibleValue = revealed[field.id]
          const shownValue = field.isSensitive
            ? (visibleValue ?? "••••••••••••••")
            : (field.value ?? "")
          return (
            <div className="secret-row" key={field.id}>
              <span className="field-label">{field.label}</span>
              <code className={cn("field-value", field.isSensitive && !visibleValue && "masked")}>
                {shownValue || "（空）"}
              </code>
              <div className="field-actions">
                {field.isSensitive ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={visibleValue ? `隐藏${field.label}` : `显示${field.label}`}
                        onClick={() => void onToggleReveal(field.id, field.label)}
                      >
                        {visibleValue ? <EyeOff /> : <Eye />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{visibleValue ? "隐藏" : "临时显示"}</TooltipContent>
                  </Tooltip>
                ) : null}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`复制${field.label}`}
                      onClick={() => void onCopyField(field.id, field.label)}
                    >
                      <Copy />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>复制{field.label}</TooltipContent>
                </Tooltip>
              </div>
            </div>
          )
        })}
        {account.fields.length === 0 ? (
          <p className="fields-empty">这个账号还没有字段，可以通过“编辑账号”添加。</p>
        ) : null}
      </div>
      <footer className="local-status">
        <ShieldCheck aria-hidden="true" />
        <span>数据仅保存在本机</span>
        <span>·</span>
        <span>敏感值按字段读取</span>
      </footer>
    </section>
  )
}
