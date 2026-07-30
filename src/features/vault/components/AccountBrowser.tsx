import {
  ChevronRight,
  Folder,
  Globe2,
  Pencil,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import type { AccountSummary, Category, Website } from "@/services/vault-client"

type AccountBrowserProps = {
  categories: Category[]
  websites: Website[]
  accounts: AccountSummary[]
  selectedCategoryId: string | null
  selectedWebsiteId: string | null
  selectedAccountId: string | null
  onSelectCategory: (id: string) => void
  onSelectWebsite: (id: string) => void
  onSelectAccount: (id: string) => void
  onCreateCategory: () => void
  onEditCategory: () => void
  onDeleteCategory: () => void
  onCreateWebsite: () => void
  onEditWebsite: () => void
  onDeleteWebsite: () => void
  onCreateAccount: () => void
}

export function AccountBrowser({
  categories,
  websites,
  accounts,
  selectedCategoryId,
  selectedWebsiteId,
  selectedAccountId,
  onSelectCategory,
  onSelectWebsite,
  onSelectAccount,
  onCreateCategory,
  onEditCategory,
  onDeleteCategory,
  onCreateWebsite,
  onEditWebsite,
  onDeleteWebsite,
  onCreateAccount,
}: AccountBrowserProps) {
  const categoryWebsites = websites.filter(
    (website) => website.categoryId === selectedCategoryId,
  )

  return (
    <section className="account-browser vault-browser" aria-label="分类、网站与账号">
      <div className="browser-section-heading">
        <span>分类</span>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="新建分类" onClick={onCreateCategory}>
          <Plus />
        </Button>
      </div>
      <div className="entity-list compact-list">
        {categories.map((category) => (
          <button
            type="button"
            key={category.id}
            className={cn(
              "entity-item",
              selectedCategoryId === category.id && "entity-item-active",
            )}
            onClick={() => onSelectCategory(category.id)}
          >
            <Folder aria-hidden="true" />
            <span>{category.name}</span>
          </button>
        ))}
        {categories.length === 0 ? (
          <p className="browser-empty">先创建一个分类来整理账号。</p>
        ) : null}
      </div>
      {selectedCategoryId ? (
        <div className="inline-entity-actions">
          <Button type="button" variant="ghost" size="sm" onClick={onEditCategory}>
            <Pencil data-icon="inline-start" />
            重命名
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onDeleteCategory}>
            <Trash2 data-icon="inline-start" />
            删除
          </Button>
        </div>
      ) : null}

      <Separator />

      <div className="browser-section-heading">
        <span>网站</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="新建网站"
          disabled={!selectedCategoryId}
          onClick={onCreateWebsite}
        >
          <Plus />
        </Button>
      </div>
      <div className="entity-list">
        {categoryWebsites.map((website) => (
          <button
            type="button"
            key={website.id}
            className={cn(
              "entity-item",
              selectedWebsiteId === website.id && "entity-item-active",
            )}
            onClick={() => onSelectWebsite(website.id)}
          >
            <Globe2 aria-hidden="true" />
            <span>
              <strong>{website.name}</strong>
              <small>{website.primaryUrl ?? "未设置网址"}</small>
            </span>
            <ChevronRight aria-hidden="true" />
          </button>
        ))}
        {selectedCategoryId && categoryWebsites.length === 0 ? (
          <p className="browser-empty">这个分类还没有网站。</p>
        ) : null}
      </div>
      {selectedWebsiteId ? (
        <div className="inline-entity-actions">
          <Button type="button" variant="ghost" size="sm" onClick={onEditWebsite}>
            <Pencil data-icon="inline-start" />
            编辑
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onDeleteWebsite}>
            <Trash2 data-icon="inline-start" />
            删除
          </Button>
        </div>
      ) : null}

      <Separator />

      <div className="account-list-heading">
        <span>账号</span>
        <Badge variant="secondary">{accounts.length}</Badge>
      </div>
      <div className="account-list">
        {accounts.map((account) => (
          <button
            type="button"
            key={account.id}
            className={cn(
              "account-item",
              selectedAccountId === account.id && "account-item-active",
            )}
            onClick={() => onSelectAccount(account.id)}
          >
            <span className="account-avatar">
              <UserRound aria-hidden="true" />
            </span>
            <span>
              <strong>{account.displayName}</strong>
              <small>{account.summary ?? "尚无用户名或邮箱"}</small>
            </span>
            <ChevronRight aria-hidden="true" />
          </button>
        ))}
        {selectedWebsiteId && accounts.length === 0 ? (
          <p className="browser-empty">这个网站还没有账号。</p>
        ) : null}
      </div>
      <Button
        type="button"
        variant="outline"
        className="add-account"
        disabled={!selectedWebsiteId}
        onClick={onCreateAccount}
      >
        <Plus data-icon="inline-start" />
        添加账号
      </Button>
    </section>
  )
}
