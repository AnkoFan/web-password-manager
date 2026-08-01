import { useEffect, useState } from "react"
import { ArchiveRestore, CopyCheck, Database, HardDriveDownload, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

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
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { vaultClient, type AppSettings, type BackupInfo } from "@/services/vault-client"

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请重试。"
}

export function SettingsView() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [saving, setSaving] = useState(false)
  const [creatingBackup, setCreatingBackup] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<BackupInfo | null>(null)
  const [restoring, setRestoring] = useState(false)

  useEffect(() => {
    let active = true
    void Promise.all([vaultClient.getAppSettings(), vaultClient.listBackups()])
      .then(([nextSettings, nextBackups]) => {
        if (!active) return
        setSettings(nextSettings)
        setBackups(nextBackups)
      })
      .catch((error: unknown) => {
        toast.error("无法读取设置", { description: errorMessage(error) })
      })
    return () => {
      active = false
    }
  }, [])

  async function save() {
    if (!settings) return
    setSaving(true)
    try {
      setSettings(await vaultClient.updateAppSettings(settings))
      toast.success("设置已保存")
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
      setBackups(await vaultClient.listBackups())
      toast.success("加密备份已创建")
    } catch (error) {
      toast.error("备份失败", { description: errorMessage(error) })
    } finally {
      setCreatingBackup(false)
    }
  }

  async function restore() {
    if (!restoreTarget) return
    setRestoring(true)
    try {
      await vaultClient.restoreBackup(restoreTarget.id)
      toast.success("备份已恢复，正在重新载入")
      window.location.reload()
    } catch (error) {
      toast.error("恢复失败", { description: errorMessage(error) })
      setRestoring(false)
      setRestoreTarget(null)
    }
  }

  if (!settings) {
    return <div className="workspace-loading">正在读取设置…</div>
  }

  return (
    <section className="settings-view" aria-label="本地设置与备份">
      <header>
        <p>本地设置</p>
        <h1>设置</h1>
        <span>调整剪贴板清理，并管理仅保存在本机的自动加密数据库备份。</span>
      </header>

      <div className="settings-grid">
        <Card>
          <CardHeader>
            <CardTitle>Windows 自动加密</CardTitle>
            <CardDescription>
              Windows 桌面端使用 SQLCipher 加密数据库，并由当前 Windows 用户的 DPAPI 自动保护随机密钥。
            </CardDescription>
            <CardAction>
              <ShieldCheck aria-hidden="true" />
            </CardAction>
          </CardHeader>
          <CardContent>
            <p className="settings-empty">
              无需主密码，也没有锁定或解锁功能。数据库通常只能在当前 Windows 用户配置文件中自动打开；浏览器开发原型仅驻留内存。项目目前仍只使用虚构测试数据。
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>剪贴板清理</CardTitle>
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
                    current ? { ...current, clipboardClearSeconds: Number(value) } : current,
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
              备份包含 SQLCipher 数据库、DPAPI 密钥文件和 SHA-256 清单，恢复时需要原 Windows 用户的 DPAPI 凭据。
            </CardDescription>
            <CardAction>
              <Database aria-hidden="true" />
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
                    <Button type="button" variant="outline" onClick={() => setRestoreTarget(backup)}>
                      恢复
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="settings-empty">尚未创建本机加密备份。</p>
            )}
          </CardContent>
          <CardFooter>
            <Button onClick={() => void createBackup()} disabled={creatingBackup}>
              <HardDriveDownload data-icon="inline-start" />
              {creatingBackup ? "正在创建…" : "创建加密备份"}
            </Button>
          </CardFooter>
        </Card>
      </div>

      <AlertDialog open={Boolean(restoreTarget)} onOpenChange={(open) => !open && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>恢复这份加密备份？</AlertDialogTitle>
            <AlertDialogDescription>
              当前数据库会被所选备份替换。恢复前请确认当前内容不需要保留。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>取消</AlertDialogCancel>
            <AlertDialogAction disabled={restoring} onClick={(event) => {
              event.preventDefault()
              void restore()
            }}>
              {restoring ? "正在恢复…" : "确认恢复"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
