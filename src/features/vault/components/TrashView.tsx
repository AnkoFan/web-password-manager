import { useEffect, useMemo, useRef, useState } from "react"
import { RotateCcw, Trash2 } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import type { TrashItem } from "@/services/vault-client"

type TrashViewProps = {
  items: TrashItem[]
  onRestore: (groupIds: string[]) => Promise<void>
  onPermanentlyDelete: (groupIds: string[]) => Promise<void>
}

type ConfirmAction = "restore" | "purge" | null

const typeLabels: Record<TrashItem["entityType"], string> = {
  category: "分类",
  website: "网站",
  account: "账号",
}

export function TrashView({
  items,
  onRestore,
  onPermanentlyDelete,
}: TrashViewProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [pending, setPending] = useState(false)
  const confirmTriggerRef = useRef<HTMLButtonElement | null>(null)
  const selected = useMemo(
    () =>
      items
        .filter((item) => selectedIds.has(item.groupId))
        .map((item) => item.groupId),
    [items, selectedIds],
  )
  const allSelected = items.length > 0 && selected.length === items.length

  useEffect(() => {
    const available = new Set(items.map((item) => item.groupId))
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => available.has(id)))
      return next.size === current.size ? current : next
    })
  }, [items])

  async function confirm() {
    if (!confirmAction || selected.length === 0) return
    setPending(true)
    try {
      if (confirmAction === "restore") await onRestore(selected)
      else await onPermanentlyDelete(selected)
      setSelectedIds(new Set())
      closeConfirm()
    } finally {
      setPending(false)
    }
  }

  function openConfirm(
    action: Exclude<ConfirmAction, null>,
    trigger: HTMLButtonElement,
  ) {
    confirmTriggerRef.current = trigger
    setConfirmAction(action)
  }

  function closeConfirm() {
    const trigger = confirmTriggerRef.current
    confirmTriggerRef.current = null
    setConfirmAction(null)
    window.requestAnimationFrame(() => trigger?.focus())
  }

  return (
    <section className="trash-view" aria-label="回收站">
      <header>
        <div>
          <p>数据生命周期</p>
          <h1>回收站</h1>
          <span>按删除批次恢复；批量操作只作用于明确勾选的项目。</span>
        </div>
        <div className="trash-actions">
          {selected.length > 0 ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={(event) => openConfirm("restore", event.currentTarget)}
              >
                <RotateCcw data-icon="inline-start" />
                恢复所选（{selected.length}）
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={(event) => openConfirm("purge", event.currentTarget)}
              >
                <Trash2 data-icon="inline-start" />
                永久删除（{selected.length}）
              </Button>
            </>
          ) : null}
          <Badge variant="secondary">{items.length}</Badge>
        </div>
      </header>
      {items.length > 0 ? (
        <div className="trash-select-all">
          <Checkbox
            id="trash-select-all"
            checked={
              allSelected ? true : selected.length > 0 ? "indeterminate" : false
            }
            onCheckedChange={(checked) =>
              setSelectedIds(
                checked === true
                  ? new Set(items.map((item) => item.groupId))
                  : new Set(),
              )
            }
          />
          <label htmlFor="trash-select-all">
            全选当前 {items.length} 个删除批次
          </label>
        </div>
      ) : null}
      <div className="trash-list">
        {items.map((item) => (
          <article key={item.groupId}>
            <Checkbox
              aria-label={`选择${item.entityName}`}
              checked={selectedIds.has(item.groupId)}
              onCheckedChange={(checked) =>
                setSelectedIds((current) => {
                  const next = new Set(current)
                  if (checked === true) next.add(item.groupId)
                  else next.delete(item.groupId)
                  return next
                })
              }
            />
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
            <Button
              type="button"
              variant="outline"
              onClick={() => void onRestore([item.groupId])}
            >
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

      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(open) => !open && closeConfirm()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "purge"
                ? "永久删除所选批次？"
                : "恢复所选批次？"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="trash-confirm-description">
                {confirmAction === "purge" ? (
                  <>
                    <p>将永久删除明确勾选的 {selected.length} 个批次。</p>
                    <p>
                      分类或网站的全部子项，以及与这些子项关联的其他回收站批次，也会一并删除且无法恢复。
                    </p>
                    <p>
                      建议先创建并验证加密备份。这里是数据库物理删除，不等同于
                      SSD、系统快照或备份介质的安全擦除。
                    </p>
                  </>
                ) : (
                  <p>
                    将以一个原子操作恢复明确勾选的 {selected.length}{" "}
                    个批次；任一批次无法恢复时，所有更改都会回滚。
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              variant={confirmAction === "purge" ? "destructive" : "default"}
              onClick={(event) => {
                event.preventDefault()
                void confirm()
              }}
            >
              {pending
                ? "正在处理…"
                : confirmAction === "purge"
                  ? "确认永久删除"
                  : "确认恢复"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
