import { useEffect, useState, type FormEvent } from "react"
import { ArchiveRestore, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  vaultClient,
  VaultClientError,
  type BackupInfo,
} from "@/services/vault-client"

type UnlockScreenProps = {
  onUnlock: (password: string) => Promise<void>
  onRestore: (backupId: string, password: string) => Promise<void>
  notice?: string
}

export function UnlockScreen({ onUnlock, onRestore, notice }: UnlockScreenProps) {
  const [password, setPassword] = useState("")
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [backupId, setBackupId] = useState("")
  const [restoreConfirmed, setRestoreConfirmed] = useState(false)
  const [restoring, setRestoring] = useState(false)

  useEffect(() => {
    let active = true
    void vaultClient
      .listBackups()
      .then((values) => {
        if (!active) return
        setBackups(values)
        setBackupId(values[0]?.id ?? "")
      })
      .catch(() => {
        if (active) setError("无法读取本机备份列表。")
      })
    return () => {
      active = false
    }
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError("")
    try {
      await onUnlock(password)
    } catch (error) {
      const message =
        error instanceof VaultClientError && error.code === "vault_version_too_new"
          ? "这个保险库来自更新版本，请先升级应用。"
          : error instanceof VaultClientError && error.code === "vault_migration_required"
            ? "保险库需要升级后才能打开。"
            : error instanceof VaultClientError && error.code === "storage_unavailable"
              ? "无法读取本地保险库，请检查文件权限。"
              : "主密码不正确，或保险库已经损坏。"
      setError(message)
    } finally {
      setPending(false)
    }
  }

  async function restore() {
    if (!backupId || !restoreConfirmed || !password) return
    setRestoring(true)
    setError("")
    try {
      await onRestore(backupId, password)
    } catch {
      setError("恢复失败：请检查主密码和备份完整性。当前保险库未被覆盖。")
    } finally {
      setRestoring(false)
    }
  }

  return (
    <main className="unlock-shell">
      <div className="unlock-layout">
        <Card className="unlock-card">
          <CardHeader className="items-center text-center">
            <div className="brand-mark">
              <LockKeyhole aria-hidden="true" />
            </div>
            <CardTitle>解锁本地保险库</CardTitle>
            <CardDescription>数据仍在这台电脑上。输入主密码后才能访问。</CardDescription>
          </CardHeader>
          <form onSubmit={submit}>
            <CardContent>
              <FieldGroup>
                {notice ? (
                  <p className="lock-notice" role="status" aria-live="polite">
                    {notice}
                  </p>
                ) : null}
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="unlock-password">主密码</FieldLabel>
                  <div className="password-control">
                    <Input
                      id="unlock-password"
                      aria-describedby={error ? "unlock-error" : undefined}
                      aria-invalid={Boolean(error)}
                      autoFocus
                      autoComplete="current-password"
                      type={visible ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={visible ? "隐藏主密码" : "显示主密码"}
                      onClick={() => setVisible((current) => !current)}
                    >
                      {visible ? <EyeOff /> : <Eye />}
                    </Button>
                  </div>
                  <FieldError id="unlock-error">{error}</FieldError>
                </Field>
              </FieldGroup>
            </CardContent>
            <CardFooter className="flex-col">
              <Button type="submit" size="lg" className="w-full" disabled={pending || !password}>
                <ShieldCheck data-icon="inline-start" />
                {pending ? "正在解锁…" : "解锁"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                忘记主密码时，软件无法代替你恢复数据。
              </p>
            </CardFooter>
          </form>
        </Card>

        {backups.length ? (
          <Card className="restore-card">
            <CardHeader>
              <div className="brand-mark brand-mark-small">
                <ArchiveRestore aria-hidden="true" />
              </div>
              <CardTitle>从本机备份恢复</CardTitle>
              <CardDescription>
                恢复前会验证清单、文件摘要、主密码和 SQLCipher 完整性。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel>备份</FieldLabel>
                  <Select value={backupId} onValueChange={setBackupId}>
                    <SelectTrigger aria-label="选择本机备份">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {backups.map((backup) => (
                          <SelectItem key={backup.id} value={backup.id}>
                            {new Date(backup.createdAt).toLocaleString()}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field orientation="horizontal">
                  <Checkbox
                    id="confirm-restore"
                    checked={restoreConfirmed}
                    onCheckedChange={(checked) => setRestoreConfirmed(checked === true)}
                  />
                  <FieldLabel htmlFor="confirm-restore">
                    我理解：恢复会用所选备份替换当前保险库。
                  </FieldLabel>
                </Field>
              </FieldGroup>
            </CardContent>
            <CardFooter>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={!password || !restoreConfirmed || restoring}
                onClick={() => void restore()}
              >
                <ArchiveRestore data-icon="inline-start" />
                {restoring ? "正在验证并恢复…" : "验证并恢复所选备份"}
              </Button>
            </CardFooter>
          </Card>
        ) : null}
      </div>
    </main>
  )
}
