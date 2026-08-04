import { useState, type FormEvent } from "react"
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  Plus,
  Trash2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type {
  AccountDetail,
  AccountDraft,
  AccountField,
  AccountFieldDraft,
  FieldType,
  SystemRole,
} from "@/services/vault-client"

import { PasswordGeneratorButton } from "./PasswordGeneratorButton"

type EditableField = AccountFieldDraft & {
  key: string
  systemRole: SystemRole | null
  fieldType: FieldType
  value: string
  keepExistingValue: boolean
}

type AccountDetailDialogProps = {
  account: AccountDetail
  websiteName: string
  revealed: Record<string, string>
  onClose: () => void
  onSave: (draft: AccountDraft) => Promise<void>
  onToggleReveal: (fieldId: string, label: string) => Promise<void>
  onCopyField: (fieldId: string, label: string) => Promise<void>
}

const fieldTypeLabels: Record<FieldType, string> = {
  text: "单行文本",
  password: "密码",
  email: "邮箱",
  url: "网址",
  multiline: "多行文本",
}

function newFieldKey() {
  return crypto.randomUUID()
}

function editableField(field: AccountField): EditableField {
  return {
    key: field.id,
    id: field.id,
    systemRole: field.systemRole,
    label: field.label,
    fieldType: field.fieldType,
    value: field.isSensitive ? "" : (field.value ?? ""),
    keepExistingValue: field.isSensitive,
    isSensitive: field.isSensitive,
  }
}

function emptySystemField(role: SystemRole): EditableField {
  const shape: Record<
    SystemRole,
    Pick<EditableField, "label" | "fieldType" | "isSensitive">
  > = {
    username: { label: "用户名", fieldType: "text", isSensitive: false },
    password: { label: "密码", fieldType: "password", isSensitive: true },
    email: { label: "主邮箱", fieldType: "email", isSensitive: false },
    note: { label: "备注", fieldType: "multiline", isSensitive: false },
  }
  return {
    key: `system-${role}`,
    systemRole: role,
    value: "",
    keepExistingValue: false,
    ...shape[role],
  }
}

function systemField(account: AccountDetail, role: SystemRole) {
  const existing = account.fields.find((field) => field.systemRole === role)
  return existing ? editableField(existing) : emptySystemField(role)
}

function normalizedLabel(value: string) {
  return value.trim().normalize("NFKC").toLocaleLowerCase()
}

function fieldDraft(field: EditableField): AccountFieldDraft {
  return {
    id: field.id,
    systemRole: field.systemRole,
    label: field.label,
    fieldType: field.fieldType,
    value: field.keepExistingValue ? null : field.value,
    keepExistingValue: field.keepExistingValue,
    isSensitive: field.isSensitive,
  }
}

export function buildAccountDetailDraft(
  account: AccountDetail,
  displayName: string,
  username: EditableField,
  password: EditableField,
  email: EditableField,
  note: EditableField,
  customFields: EditableField[],
): AccountDraft {
  const fields = [username, password]
  if (email.value.trim()) fields.push(email)
  if (note.value.trim()) fields.push(note)
  fields.push(...customFields)
  return {
    id: account.id,
    websiteId: account.websiteId,
    displayName,
    fields: fields.map(fieldDraft),
  }
}

function currentValue(field: EditableField, revealed: Record<string, string>) {
  return field.keepExistingValue && field.id
    ? (revealed[field.id] ?? "")
    : field.value
}

function hasStoredOrEnteredValue(
  field: EditableField,
  revealed: Record<string, string>,
) {
  return field.keepExistingValue || Boolean(currentValue(field, revealed).trim())
}

export function AccountDetailDialog({
  account,
  websiteName,
  revealed,
  onClose,
  onSave,
  onToggleReveal,
  onCopyField,
}: AccountDetailDialogProps) {
  const [displayName, setDisplayName] = useState(account.displayName)
  const [username, setUsername] = useState(() => systemField(account, "username"))
  const [password, setPassword] = useState(() => systemField(account, "password"))
  const [email, setEmail] = useState(() => systemField(account, "email"))
  const [note, setNote] = useState(() => systemField(account, "note"))
  const [customFields, setCustomFields] = useState(() =>
    account.fields
      .filter((field) => field.systemRole === null)
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map(editableField),
  )
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  function updateSystemField(
    setter: React.Dispatch<React.SetStateAction<EditableField>>,
    value: string,
  ) {
    setter((current) => ({
      ...current,
      value,
      keepExistingValue: false,
    }))
  }

  function updateCustomField(key: string, update: Partial<EditableField>) {
    setCustomFields((current) =>
      current.map((field) =>
        field.key === key
          ? {
              ...field,
              ...update,
              keepExistingValue:
                update.value === undefined ? field.keepExistingValue : false,
              isSensitive:
                update.fieldType === "password"
                  ? true
                  : (update.isSensitive ?? field.isSensitive),
            }
          : field,
      ),
    )
  }

  function moveCustomField(index: number, direction: -1 | 1) {
    setCustomFields((current) => {
      const target = index + direction
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function validate() {
    if (!displayName.trim()) return "账号名称不能为空。"
    if (!hasStoredOrEnteredValue(username, revealed)) return "用户名不能为空。"
    if (!password.keepExistingValue && !password.value) return "密码不能为空。"

    const labels = [username, password]
    if (email.value.trim()) labels.push(email)
    if (note.value.trim()) labels.push(note)
    labels.push(...customFields)
    if (customFields.some((field) => !field.label.trim())) {
      return "自定义字段名称不能为空。"
    }
    const labelKeys = labels.map((field) => normalizedLabel(field.label))
    if (new Set(labelKeys).size !== labelKeys.length) {
      return "同一账号内不能有重复字段名称。"
    }
    return ""
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    setPending(true)
    setError("")
    try {
      await onSave(
        buildAccountDetailDraft(
          account,
          displayName,
          username,
          password,
          email,
          note,
          customFields,
        ),
      )
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败，请重试。")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="account-detail-dialog sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>账号详情</DialogTitle>
          <DialogDescription>
            编辑 {websiteName} 的基础字段和自定义字段。敏感值不会自动显示。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="account-detail-form">
          <div className="account-detail-scroll">
            <FieldGroup>
              <section className="account-detail-section" aria-labelledby="account-basic-heading">
                <h3 id="account-basic-heading">基础信息</h3>
              <Field data-invalid={!displayName.trim()}>
                <FieldLabel htmlFor="account-detail-name">账号名称</FieldLabel>
                <Input
                  id="account-detail-name"
                  autoFocus
                  maxLength={200}
                  aria-invalid={!displayName.trim()}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </Field>

              <div className="account-detail-grid">
                <Field data-invalid={!hasStoredOrEnteredValue(username, revealed)}>
                  <FieldLabel htmlFor="account-detail-username">用户名</FieldLabel>
                  <div className="account-detail-value-row">
                    <Input
                      id="account-detail-username"
                      maxLength={65_536}
                      aria-invalid={!hasStoredOrEnteredValue(username, revealed)}
                      placeholder={username.keepExistingValue ? "已保存（输入新值替换）" : undefined}
                      value={currentValue(username, revealed)}
                      onChange={(event) => updateSystemField(setUsername, event.target.value)}
                    />
                    {username.id ? (
                      <Button type="button" variant="ghost" size="icon-sm" aria-label="复制用户名" title="复制用户名" onClick={() => void onCopyField(username.id!, username.label)}>
                        <Copy />
                      </Button>
                    ) : null}
                  </div>
                </Field>

                <Field data-invalid={!password.keepExistingValue && !password.value}>
                  <FieldLabel htmlFor="account-detail-password">密码</FieldLabel>
                  <div className="account-detail-value-row">
                    <Input
                      id="account-detail-password"
                      type={password.id && revealed[password.id] ? "text" : "password"}
                      maxLength={65_536}
                      aria-invalid={!password.keepExistingValue && !password.value}
                      placeholder={password.keepExistingValue ? "已保存（输入新密码替换）" : undefined}
                      value={currentValue(password, revealed)}
                      onChange={(event) => updateSystemField(setPassword, event.target.value)}
                    />
                    {password.id ? (
                      <>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={revealed[password.id] ? "隐藏密码" : "显示密码"} title={revealed[password.id] ? "隐藏密码" : "显示密码"} onClick={() => void onToggleReveal(password.id!, password.label)}>
                          {revealed[password.id] ? <EyeOff /> : <Eye />}
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="复制密码" title="复制密码" onClick={() => void onCopyField(password.id!, password.label)}>
                          <Copy />
                        </Button>
                      </>
                    ) : null}
                    <PasswordGeneratorButton
                      onGenerated={(generatedPassword) => {
                        updateSystemField(setPassword, generatedPassword)
                        setError("")
                      }}
                    />
                  </div>
                </Field>
              </div>
              </section>

              <section className="account-detail-section" aria-labelledby="account-extra-heading">
                <h3 id="account-extra-heading">补充信息</h3>
                <div className="account-detail-grid account-extra-grid">
                <Field>
                <FieldLabel htmlFor="account-detail-email">主邮箱（可选）</FieldLabel>
                <div className="account-detail-value-row">
                  <Input
                    id="account-detail-email"
                    type="email"
                    maxLength={65_536}
                    placeholder="demo@example.test"
                    value={email.value}
                    onChange={(event) => updateSystemField(setEmail, event.target.value)}
                  />
                  {email.id ? (
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="复制主邮箱" title="复制主邮箱" onClick={() => void onCopyField(email.id!, email.label)}>
                      <Copy />
                    </Button>
                  ) : null}
                </div>
                <FieldDescription>每个账号最多一个主邮箱；主邮箱允许搜索和复制。</FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="account-detail-note">备注（可选）</FieldLabel>
                <Textarea
                  id="account-detail-note"
                  rows={5}
                  maxLength={1_048_576}
                  placeholder="记录该账号的非敏感说明"
                  value={note.value}
                  onChange={(event) => updateSystemField(setNote, event.target.value)}
                />
                <FieldDescription>备注固定为非敏感多行字段，不进入搜索索引。</FieldDescription>
              </Field>
                </div>
              </section>

              <section className="account-detail-section" aria-labelledby="account-custom-heading">
              <div className="account-detail-section-heading">
                <h3 id="account-custom-heading">自定义字段</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCustomFields((current) => [
                      ...current,
                      {
                        key: newFieldKey(),
                        systemRole: null,
                        label: "",
                        fieldType: "text",
                        value: "",
                        keepExistingValue: false,
                        isSensitive: false,
                      },
                    ])
                  }
                >
                  <Plus data-icon="inline-start" /> 添加自定义字段
                </Button>
              </div>
              <div className="account-custom-fields" aria-label="自定义字段列表">
                {customFields.map((field, index) => {
                  const value = currentValue(field, revealed)
                  const revealedValue = field.id ? revealed[field.id] : undefined
                  return (
                    <section className="account-custom-field" key={field.key} aria-label={`自定义字段 ${index + 1}`}>
                      <div className="account-custom-field-heading">
                        <strong>字段 {index + 1}</strong>
                        <div className="account-custom-field-actions">
                          <Button type="button" variant="ghost" size="icon-sm" disabled={index === 0} aria-label={`上移字段 ${index + 1}`} title="上移" onClick={() => moveCustomField(index, -1)}>
                            <ArrowUp />
                          </Button>
                          <Button type="button" variant="ghost" size="icon-sm" disabled={index === customFields.length - 1} aria-label={`下移字段 ${index + 1}`} title="下移" onClick={() => moveCustomField(index, 1)}>
                            <ArrowDown />
                          </Button>
                          <Button type="button" variant="ghost" size="icon-sm" aria-label={`删除字段 ${index + 1}`} title="删除字段" onClick={() => setCustomFields((current) => current.filter((entry) => entry.key !== field.key))}>
                            <Trash2 />
                          </Button>
                        </div>
                      </div>
                      <div className="account-custom-field-grid">
                        <Field data-invalid={!field.label.trim()}>
                          <FieldLabel htmlFor={`custom-label-${field.key}`}>字段名称</FieldLabel>
                          <Input
                            id={`custom-label-${field.key}`}
                            maxLength={100}
                            aria-invalid={!field.label.trim()}
                            value={field.label}
                            onChange={(event) => updateCustomField(field.key, { label: event.target.value })}
                          />
                        </Field>
                        <Field>
                          <FieldLabel>字段类型</FieldLabel>
                          <Select value={field.fieldType} onValueChange={(fieldType: FieldType) => updateCustomField(field.key, { fieldType })}>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {(Object.keys(fieldTypeLabels) as FieldType[]).map((fieldType) => (
                                  <SelectItem key={fieldType} value={fieldType}>{fieldTypeLabels[fieldType]}</SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </Field>
                      </div>
                      <Field>
                        <FieldLabel htmlFor={`custom-value-${field.key}`}>字段内容</FieldLabel>
                        <div className="account-detail-value-row">
                          {field.fieldType === "multiline" ? (
                            <Textarea
                              id={`custom-value-${field.key}`}
                              rows={3}
                              maxLength={1_048_576}
                              placeholder={field.keepExistingValue ? "已保存（输入新值替换）" : undefined}
                              value={value}
                              onChange={(event) => updateCustomField(field.key, { value: event.target.value })}
                            />
                          ) : (
                            <Input
                              id={`custom-value-${field.key}`}
                              type={field.fieldType === "password" && !revealedValue ? "password" : field.fieldType === "email" ? "email" : field.fieldType === "url" ? "url" : "text"}
                              maxLength={65_536}
                              placeholder={field.keepExistingValue ? "已保存（输入新值替换）" : undefined}
                              value={value}
                              onChange={(event) => updateCustomField(field.key, { value: event.target.value })}
                            />
                          )}
                          {field.id ? (
                            <>
                              {field.isSensitive ? (
                                <Button type="button" variant="ghost" size="icon-sm" aria-label={revealedValue ? `隐藏${field.label}` : `显示${field.label}`} title={revealedValue ? "隐藏字段" : "显示字段"} onClick={() => void onToggleReveal(field.id!, field.label)}>
                                  {revealedValue ? <EyeOff /> : <Eye />}
                                </Button>
                              ) : null}
                              <Button type="button" variant="ghost" size="icon-sm" aria-label={`复制${field.label}`} title="复制字段" onClick={() => void onCopyField(field.id!, field.label)}>
                                <Copy />
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </Field>
                      <Field orientation="horizontal" data-disabled={field.fieldType === "password"}>
                        <Checkbox
                          id={`custom-sensitive-${field.key}`}
                          checked={field.isSensitive}
                          disabled={field.fieldType === "password"}
                          onCheckedChange={(checked) => updateCustomField(field.key, { isSensitive: checked === true })}
                        />
                        <FieldLabel htmlFor={`custom-sensitive-${field.key}`}>敏感字段，默认隐藏</FieldLabel>
                      </Field>
                    </section>
                  )
                })}
              </div>
              {customFields.length === 0 ? <p className="account-custom-empty">尚未添加自定义字段。</p> : null}
              </section>
              <FieldError id="account-detail-error">{error}</FieldError>
            </FieldGroup>
          </div>
          <DialogFooter className="account-detail-footer">
            <Button type="button" variant="outline" onClick={onClose}>取消</Button>
            <Button type="submit" disabled={pending}>{pending ? "正在保存…" : "保存全部更改"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
