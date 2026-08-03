import { useState } from "react"

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
import type { CloseBehavior } from "@/services/vault-client"

type CloseAction = Exclude<CloseBehavior, "ask">

type CloseBehaviorDialogProps = {
  open: boolean
  onCancel: () => void
  onChoose: (action: CloseAction) => Promise<void>
}

export function CloseBehaviorDialog({ open, onCancel, onChoose }: CloseBehaviorDialogProps) {
  const [pendingAction, setPendingAction] = useState<CloseAction | null>(null)

  async function choose(action: CloseAction) {
    setPendingAction(action)
    try {
      await onChoose(action)
    } catch {
      // The parent owns user-facing error reporting and keeps the dialog open for retry.
    } finally {
      setPendingAction(null)
    }
  }

  const pending = pendingAction !== null

  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => !nextOpen && !pending && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>关闭 WebPasswordManager？</AlertDialogTitle>
          <AlertDialogDescription>
            请选择以后点击关闭按钮时的默认行为。你可以随时在设置中更改。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
          <AlertDialogAction
            variant="outline"
            disabled={pending}
            onClick={(event) => {
              event.preventDefault()
              void choose("minimizeToTray")
            }}
          >
            {pendingAction === "minimizeToTray" ? "正在最小化…" : "最小化至托盘"}
          </AlertDialogAction>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(event) => {
              event.preventDefault()
              void choose("exit")
            }}
          >
            {pendingAction === "exit" ? "正在关闭…" : "关闭程序"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
