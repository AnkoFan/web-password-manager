import { Folder, LockKeyhole, Settings, ShieldCheck, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type VaultView = "vault" | "trash" | "settings"

type PrimaryNavigationProps = {
  activeView: VaultView
  onNavigate: (view: VaultView) => void
  onLock: () => Promise<void>
}

export function PrimaryNavigation({
  activeView,
  onNavigate,
  onLock,
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
        <button
          type="button"
          className={cn("nav-item", activeView === "vault" && "nav-item-active")}
          onClick={() => onNavigate("vault")}
        >
          <Folder aria-hidden="true" />
          保险库
        </button>
        <button
          type="button"
          className={cn("nav-item", activeView === "trash" && "nav-item-active")}
          onClick={() => onNavigate("trash")}
        >
          <Trash2 aria-hidden="true" />
          回收站
        </button>
        <button
          type="button"
          className={cn("nav-item", activeView === "settings" && "nav-item-active")}
          onClick={() => onNavigate("settings")}
        >
          <Settings aria-hidden="true" />
          设置
        </button>
      </nav>
      <Button type="button" variant="outline" className="mt-auto justify-start" onClick={onLock}>
        <LockKeyhole data-icon="inline-start" />
        锁定
      </Button>
    </aside>
  )
}
