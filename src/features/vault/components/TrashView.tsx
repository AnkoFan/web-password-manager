import { RotateCcw, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { TrashItem } from "@/services/vault-client"

type TrashViewProps = {
  items: TrashItem[]
  onRestore: (groupId: string) => Promise<void>
}

const typeLabels: Record<TrashItem["entityType"], string> = {
  category: "分类",
  website: "网站",
  account: "账号",
}

export function TrashView({ items, onRestore }: TrashViewProps) {
  return (
    <section className="trash-view" aria-label="回收站">
      <header>
        <div>
          <p>数据生命周期</p>
          <h1>回收站</h1>
          <span>按删除批次恢复，父对象删除时包含其当时仍处于活跃状态的子对象。</span>
        </div>
        <Badge variant="secondary">{items.length}</Badge>
      </header>
      <div className="trash-list">
        {items.map((item) => (
          <article key={item.groupId}>
            <span className="trash-icon">
              <Trash2 aria-hidden="true" />
            </span>
            <div>
              <strong>{item.entityName}</strong>
              <p>
                {typeLabels[item.entityType]} ·{" "}
                {new Date(item.deletedAt).toLocaleString("zh-CN")}
              </p>
            </div>
            <Button type="button" variant="outline" onClick={() => void onRestore(item.groupId)}>
              <RotateCcw data-icon="inline-start" />
              恢复
            </Button>
          </article>
        ))}
        {items.length === 0 ? (
          <div className="trash-empty">
            <Trash2 aria-hidden="true" />
            <h2>回收站为空</h2>
            <p>删除的分类、网站和账号会作为完整批次出现在这里。</p>
          </div>
        ) : null}
      </div>
    </section>
  )
}
