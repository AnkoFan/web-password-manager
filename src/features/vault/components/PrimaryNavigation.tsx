import {
  Folder,
  Pencil,
  Plus,
  Settings,
  ShieldCheck,
  Trash2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Category } from "@/services/vault-client"

export type VaultView = "vault" | "trash" | "settings"

type PrimaryNavigationProps = {
  activeView: VaultView
  categories: Category[]
  selectedCategoryId: string | null
  onNavigate: (view: VaultView) => void
  onSelectCategory: (id: string) => void
  onCreateCategory: () => void
  onEditCategory: () => void
  onDeleteCategory: () => void
}

const navigation = [
  { view: "vault" as const, label: "保险库", icon: Folder },
  { view: "trash" as const, label: "回收站", icon: Trash2 },
  { view: "settings" as const, label: "设置", icon: Settings },
]

export function PrimaryNavigation({
  activeView,
  categories,
  selectedCategoryId,
  onNavigate,
  onSelectCategory,
  onCreateCategory,
  onEditCategory,
  onDeleteCategory,
}: PrimaryNavigationProps) {
  return (
    <aside className="primary-nav">
      <div className="nav-brand">
        <span className="brand-mark brand-mark-small">
          <ShieldCheck aria-hidden="true" />
        </span>
        <div>
          <strong>WebPasswordManager</strong>
          <span>数据仅保存在本机</span>
        </div>
      </div>

      <nav aria-label="主导航" className="nav-items">
        {navigation.map(({ view, label, icon: Icon }) => (
          <button
            type="button"
            key={view}
            className={cn("nav-item", activeView === view && "nav-item-active")}
            aria-current={activeView === view ? "page" : undefined}
            onClick={() => onNavigate(view)}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <section className="category-sidebar" aria-label="分类">
        <div className="category-sidebar-heading">
          <span>分类</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="新建分类"
            onClick={onCreateCategory}
          >
            <Plus />
          </Button>
        </div>
        <div className="category-sidebar-list">
          {categories.map((category) => (
            <button
              type="button"
              key={category.id}
              className={cn(
                "category-sidebar-item",
                activeView === "vault" &&
                  selectedCategoryId === category.id &&
                  "category-sidebar-item-active",
              )}
              onClick={() => onSelectCategory(category.id)}
            >
              <Folder aria-hidden="true" />
              <span>{category.name}</span>
            </button>
          ))}
          {categories.length === 0 ? (
            <p className="category-sidebar-empty">还没有分类</p>
          ) : null}
        </div>
        {selectedCategoryId ? (
          <div className="category-sidebar-actions">
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
      </section>

    </aside>
  )
}
