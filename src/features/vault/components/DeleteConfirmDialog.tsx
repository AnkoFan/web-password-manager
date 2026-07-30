import { Trash2 } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export type DeleteTarget = {
  type: "category" | "website" | "account"
  id: string
  name: string
  affectedCount?: number
}

type DeleteConfirmDialogProps = {
  target: DeleteTarget
  onClose: () => void
  onConfirm: () => Promise<void>
}

export function DeleteConfirmDialog({
  target,
  onClose,
  onConfirm,
}: DeleteConfirmDialogProps) {
  const impact =
    target.type === "category"
      ? `该分类下的 ${target.affectedCount ?? 0} 个网站及其账号会一起移入回收站。`
      : target.type === "website"
        ? `该网站下的 ${target.affectedCount ?? 0} 个账号会一起移入回收站。`
        : "该账号会移入回收站，字段将保留以便恢复。"

  return (
    <AlertDialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Trash2 />
          </AlertDialogMedia>
          <AlertDialogTitle>删除“{target.name}”？</AlertDialogTitle>
          <AlertDialogDescription>{impact} 你可以稍后从回收站恢复。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              void onConfirm()
            }}
          >
            移入回收站
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
