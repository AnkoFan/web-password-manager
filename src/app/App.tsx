import { useCallback, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppShell } from "@/features/vault/AppShell"
import { vaultClient } from "@/services/vault-client"

type AppState = "loading" | "ready" | "recovery"

export function App() {
  const [state, setState] = useState<AppState>("loading")
  const [startupError, setStartupError] = useState("")

  const checkStatus = useCallback(async (isActive: () => boolean = () => true) => {
    setStartupError("")
    setState("loading")
    try {
      await vaultClient.status()
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
            <p>请先复制应用数据目录，再检查文件权限或恢复已验证的明文备份。</p>
            <Button type="button" onClick={() => void checkStatus()}>
              重新检查数据库
            </Button>
          </section>
        </main>
      ) : (
        <AppShell />
      )}
      <Toaster position="bottom-right" />
    </TooltipProvider>
  )
}
