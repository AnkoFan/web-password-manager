import { useEffect, useState } from "react"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppShell } from "@/features/vault/AppShell"
import { SetupScreen } from "@/features/vault/SetupScreen"
import { UnlockScreen } from "@/features/vault/UnlockScreen"
import { vaultClient } from "@/services/vault-client"

type SessionState = "loading" | "setup" | "locked" | "unlocked" | "recovery"

export function App() {
  const [session, setSession] = useState<SessionState>("loading")
  const [startupError, setStartupError] = useState("")
  const [lockNotice, setLockNotice] = useState("")

  useEffect(() => {
    let active = true
    void vaultClient
      .status()
      .then(({ exists }) => {
        if (active) setSession(exists ? "locked" : "setup")
      })
      .catch((error: unknown) => {
        if (active) {
          setStartupError(error instanceof Error ? error.message : String(error))
          setSession("recovery")
        }
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    let unlisten: (() => void) | undefined
    void vaultClient
      .onLocked((reason) => {
        if (!active) return
        setLockNotice(
          reason === "idle_timeout"
            ? "因长时间无操作，保险库已自动锁定。"
            : reason === "focus_lost"
              ? "因切换窗口、系统锁屏或休眠，保险库已自动锁定。"
              : reason === "backup_created"
                ? "加密备份已创建，保险库已安全锁定。"
                : reason === "backup_failed"
                  ? "备份未完成，保险库仍已安全锁定。"
                  : "",
        )
        setSession("locked")
      })
      .then((cleanup) => {
        if (active) unlisten = cleanup
        else cleanup()
      })
    return () => {
      active = false
      unlisten?.()
    }
  }, [])

  async function handleCreate(password: string) {
    await vaultClient.create(password)
    setLockNotice("")
    setSession("unlocked")
  }

  async function handleUnlock(password: string) {
    await vaultClient.unlock(password)
    setLockNotice("")
    setSession("unlocked")
  }

  async function handleLock(notice = "") {
    await vaultClient.lock()
    setLockNotice(notice)
    setSession("locked")
  }

  async function handleRestore(backupId: string, password: string) {
    await vaultClient.restoreBackup(backupId, password)
    setLockNotice("")
    setSession("unlocked")
  }

  return (
    <TooltipProvider>
      {session === "loading" ? (
        <main className="unlock-shell" aria-label="正在检查本地保险库">
          <p className="text-sm text-muted-foreground">正在检查本地保险库…</p>
        </main>
      ) : session === "recovery" ? (
        <main className="unlock-shell">
          <section className="recovery-state" role="alert">
            <h1>保险库需要恢复</h1>
            <p>{startupError || "无法确认本地保险库状态。"}</p>
            <p>为避免覆盖现有数据，应用已停止创建和编辑操作。</p>
          </section>
        </main>
      ) : session === "setup" ? (
        <SetupScreen onCreate={handleCreate} />
      ) : session === "locked" ? (
        <UnlockScreen
          onUnlock={handleUnlock}
          onRestore={handleRestore}
          notice={lockNotice}
        />
      ) : (
        <AppShell onLock={handleLock} />
      )}
      <Toaster position="bottom-right" />
    </TooltipProvider>
  )
}
