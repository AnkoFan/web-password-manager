import { useCallback, useEffect, useState } from "react"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { AppShell } from "@/features/vault/AppShell"
import { SetupScreen } from "@/features/vault/SetupScreen"
import { UnlockScreen } from "@/features/vault/UnlockScreen"
import { vaultClient } from "@/services/vault-client"

import { lockNoticeForReason } from "./lock-notices"

type SessionState = "loading" | "setup" | "locked" | "unlocked" | "recovery"

export function App() {
  const [session, setSession] = useState<SessionState>("loading")
  const [startupError, setStartupError] = useState("")
  const [lockNotice, setLockNotice] = useState("")

  const checkStatus = useCallback(async (isActive: () => boolean = () => true) => {
    setStartupError("")
    setSession("loading")
    try {
      const { exists } = await vaultClient.status()
      if (isActive()) setSession(exists ? "locked" : "setup")
    } catch (error) {
      if (isActive()) {
        setStartupError(error instanceof Error ? error.message : String(error))
        setSession("recovery")
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
    let unlisten: (() => void) | undefined
    void vaultClient
      .onLocked((reason) => {
        if (!active) return
        setLockNotice(lockNoticeForReason(reason))
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
        <main
          className="unlock-shell"
          aria-label="正在检查本地保险库"
          aria-live="polite"
        >
          <p className="text-sm text-muted-foreground">正在检查本地保险库…</p>
        </main>
      ) : session === "recovery" ? (
        <main className="unlock-shell">
          <section className="recovery-state" role="alert">
            <h1>保险库需要恢复</h1>
            <p>{startupError || "无法确认本地保险库状态。"}</p>
            <p>为避免覆盖现有数据，应用已停止创建和编辑操作。</p>
            <p>请先保留应用数据目录的副本，再检查文件权限或使用已验证的备份恢复；不要删除原文件。</p>
            <Button type="button" onClick={() => void checkStatus()}>
              重新检查保险库
            </Button>
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
