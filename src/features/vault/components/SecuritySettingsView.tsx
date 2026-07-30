import { useEffect, useState } from "react"
import { ArchiveRestore, Clock3, CopyCheck, HardDriveDownload, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
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
  type BackupInfo,
  type SecuritySettings,
} from "@/services/vault-client"

type SecuritySettingsViewProps = {
  onBackupLocked: () => Promise<void>
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请重试。"
}

export function SecuritySettingsView({ onBackupLocked }: SecuritySettingsViewProps) {
  const [settings, setSettings] = useState<SecuritySettings | null>(null)
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [saving, setSaving] = useState(false)
  const [creatingBackup, setCreatingBackup] = useState(false)

  useEffect(() => {
    let active = true
    void Promise.all([vaultClient.getSecuritySettings(), vaultClient.listBackups()])
      .then(([nextSettings, nextBackups]) => {
        if (!active) return
        setSettings(nextSettings)
        setBackups(nextBackups)
      })
      .catch((error: unknown) => {
        toast.error("无法读取安全设置", { description: errorMessage(error) })
      })
    return () => {
      active = false
    }
  }, [])

  async function save() {
    if (!settings) return
    setSaving(true)
    try {
      setSettings(await vaultClient.updateSecuritySettings(settings))
      toast.success("安全设置已保存")
    } catch (error) {
      toast.error("保存失败", { description: errorMessage(error) })
    } finally {
      setSaving(false)
    }
  }

  async function createBackup() {
    setCreatingBackup(true)
    try {
      await vaultClient.createBackup()
      await onBackupLocked()
    } catch (error) {
      toast.error("备份失败", { description: errorMessage(error) })
    } finally {
      setCreatingBackup(false)
    }
  }

  if (!settings) {
    return <div className="workspace-loading">正在读取安全设置…</div>
  }

  return (
    <section className="settings-view" aria-label="安全与恢复设置">
      <header>
        <p>安全与恢复</p>
        <h1>设置</h1>
        <span>控制自动锁定、剪贴板清理和本机加密备份。</span>
      </header>

      <div className="settings-grid">
        <Card>
          <CardHeader>
            <CardTitle>自动锁定</CardTitle>
            <CardDescription>
              空闲超时由 Rust 会话强制执行；切换窗口时可立即关闭数据库连接。
            </CardDescription>
            <CardAction>
              <ShieldCheck aria-hidden="true" />
            </CardAction>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel>空闲多久后锁定</FieldLabel>
                <Select
                  value={String(settings.autoLockMinutes)}
                  onValueChange={(value) =>
                    setSettings((current) =>
                      current ? { ...current, autoLockMinutes: Number(value) } : current,
                    )
                  }
                >
                  <SelectTrigger aria-label="自动锁定时间">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {[1, 5, 10, 15, 30, 60].map((minutes) => (
                        <SelectItem key={minutes} value={String(minutes)}>
                          {minutes} 分钟
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field orientation="horizontal">
                <Checkbox
                  id="lock-on-focus-loss"
                  checked={settings.lockOnFocusLoss}
                  onCheckedChange={(checked) =>
                    setSettings((current) =>
                      current
                        ? { ...current, lockOnFocusLoss: checked === true }
                        : current,
                    )
                  }
                />
                <FieldLabel htmlFor="lock-on-focus-loss">
                  切换到其他窗口、系统锁屏或休眠时立即锁定
                </FieldLabel>
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter>
            <Button onClick={() => void save()} disabled={saving}>
              <Clock3 data-icon="inline-start" />
              {saving ? "正在保存…" : "保存锁定设置"}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>剪贴板保护</CardTitle>
            <CardDescription>
              仅当剪贴板仍包含本应用本次写入的内容时才会清理，不覆盖之后复制的内容。
            </CardDescription>
            <CardAction>
              <CopyCheck aria-hidden="true" />
            </CardAction>
          </CardHeader>
          <CardContent>
            <Field>
              <FieldLabel>复制后多久清理</FieldLabel>
              <Select
                value={String(settings.clipboardClearSeconds)}
                onValueChange={(value) =>
                  setSettings((current) =>
                    current
                      ? { ...current, clipboardClearSeconds: Number(value) }
                      : current,
                  )
                }
              >
                <SelectTrigger aria-label="剪贴板清理时间">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {[5, 15, 30, 60, 120, 300].map((seconds) => (
                      <SelectItem key={seconds} value={String(seconds)}>
                        {seconds} 秒
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </CardContent>
          <CardFooter>
            <Button onClick={() => void save()} disabled={saving}>
              <CopyCheck data-icon="inline-start" />
              {saving ? "正在保存…" : "保存清理设置"}
            </Button>
          </CardFooter>
        </Card>

        <Card className="backup-card">
          <CardHeader>
            <CardTitle>本机加密备份</CardTitle>
            <CardDescription>
              备份包含加密数据库、安全头和校验清单。创建前会安全关闭当前连接，完成后保持锁定。
            </CardDescription>
            <CardAction>
              <HardDriveDownload aria-hidden="true" />
            </CardAction>
          </CardHeader>
          <CardContent>
            {backups.length ? (
              <div className="backup-list">
                {backups.slice(0, 5).map((backup) => (
                  <div key={backup.id}>
                    <ArchiveRestore aria-hidden="true" />
                    <span>
                      <strong>{new Date(backup.createdAt).toLocaleString()}</strong>
                      <small>{backup.id}</small>
                    </span>
                    <Badge variant="secondary">schema v{backup.schemaVersion}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="settings-empty">尚未创建本机备份。</p>
            )}
          </CardContent>
          <CardFooter>
            <Button onClick={() => void createBackup()} disabled={creatingBackup}>
              <HardDriveDownload data-icon="inline-start" />
              {creatingBackup ? "正在创建…" : "创建备份并锁定"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </section>
  )
}
