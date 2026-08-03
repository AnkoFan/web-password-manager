import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppShell } from "@/features/vault/AppShell"
import { applyAccentColor, DEFAULT_ACCENT_COLOR } from "@/features/vault/accent-colors"
import { vaultClient } from "@/services/vault-client"
import type { CloseBehavior } from "@/services/vault-client"

import { CloseBehaviorDialog } from "./CloseBehaviorDialog"

type AppState = "loading" | "ready" | "recovery"

export function App() {
  const [state, setState] = useState<AppState>("loading")
  const [startupError, setStartupError] = useState("")
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)

  const checkStatus = useCallback(async (isActive: () => boolean = () => true) => {
    setStartupError("")
    setState("loading")
    try {
      const [, settings] = await Promise.all([
        vaultClient.status(),
        vaultClient.getAppSettings(),
      ])
      applyAccentColor(settings?.accentColor ?? DEFAULT_ACCENT_COLOR)
      if (isActive()) setState("ready")
    } catch (error) {
      if (isActive()) {
        setStartupError(error instanceof Error ? error.message : String(error))
        setState("recovery")
      }
    }
  }, [])

  useEffect(() => {
    let active = true
    void checkStatus(() => active)
    return () => {
      active = false
    }
  }, [checkStatus])

  useEffect(() => {
    let active = true
    let stopListening: () => void = () => undefined
    void vaultClient
      .onCloseRequested(() => {
        if (active) setCloseDialogOpen(true)
      })
      .then((unlisten) => {
        if (active) stopListening = unlisten
        else unlisten()
      })
      .catch((error: unknown) => {
        toast.error("无法监听窗口关闭操作", {
          description: error instanceof Error ? error.message : "请重启应用后重试。",
        })
      })
    return () => {
      active = false
      stopListening()
    }
  }, [])

  async function chooseCloseBehavior(action: Exclude<CloseBehavior, "ask">) {
    try {
      const current = await vaultClient.getAppSettings()
      await vaultClient.updateAppSettings({ ...current, closeBehavior: action })
      await vaultClient.applyCloseAction(action)
      setCloseDialogOpen(false)
    } catch (error) {
      toast.error("无法应用关闭行为", {
        description: error instanceof Error ? error.message : "请重试。",
      })
      throw error
    }
  }

  return (
    <TooltipProvider>
      {state === "loading" ? (
        <main className="startup-shell" aria-label="正在检查本地数据库" aria-live="polite">
          <p className="text-sm text-muted-foreground">正在检查本地数据库…</p>
        </main>
      ) : state === "recovery" ? (
        <main className="startup-shell">
          <section className="recovery-state" role="alert">
            <h1>本地数据库需要处理</h1>
            <p>{startupError || "无法确认本地数据库状态。"}</p>
            <p>为避免覆盖现有文件，应用已停止创建和编辑操作。</p>
            <p>请先复制应用数据目录，再检查文件权限、DPAPI 用户身份或恢复已验证的加密备份。</p>
            <Button type="button" onClick={() => void checkStatus()}>
              重新检查数据库
            </Button>
          </section>
        </main>
      ) : (
        <AppShell />
      )}
      <CloseBehaviorDialog
        open={closeDialogOpen}
        onCancel={() => setCloseDialogOpen(false)}
        onChoose={chooseCloseBehavior}
      />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  )
}
