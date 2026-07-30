import { useState, type FormEvent } from "react"
import { Plus, Trash2 } from "lucide-react"

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
import type {
  AccountDetail,
  AccountDraft,
  AccountFieldDraft,
  Category,
  FieldType,
  SystemRole,
  Website,
  WebsiteDraft,
} from "@/services/vault-client"

export type EditorState =
  | { kind: "category"; category?: Category }
  | { kind: "website"; website?: Website; categoryId: string }
  | { kind: "account"; account?: AccountDetail; websiteId: string }

type VaultEditorDialogProps = {
  editor: EditorState
  categories: Category[]
  onClose: () => void
  onSaveCategory: (id: string | undefined, name: string) => Promise<void>
  onSaveWebsite: (draft: WebsiteDraft) => Promise<void>
  onSaveAccount: (draft: AccountDraft) => Promise<void>
}

type EditableField = AccountFieldDraft & { clientId: string }

const fieldTypes: Array<{ value: FieldType; label: string }> = [
  { value: "text", label: "文本" },
  { value: "password", label: "密码" },
  { value: "email", label: "邮箱" },
  { value: "url", label: "网址" },
  { value: "multiline", label: "多行文本" },
]

const systemRoles: Array<{ value: SystemRole; label: string }> = [
  { value: "username", label: "用户名" },
  { value: "password", label: "密码" },
  { value: "email", label: "邮箱" },
  { value: "note", label: "备注" },
]

function newField(role?: SystemRole): EditableField {
  const password = role === "password"
  return {
    clientId: crypto.randomUUID(),
    systemRole: role ?? null,
    label: role === "username" ? "用户名" : role === "password" ? "密码" : "自定义字段",
    fieldType: password ? "password" : "text",
    value: "",
    isSensitive: password,
  }
}

function initialFields(account?: AccountDetail): EditableField[] {
  if (!account) return [newField("username"), newField("password")]
  return account.fields.map((field) => ({
    clientId: field.id,
    id: field.id,
    systemRole: field.systemRole,
    label: field.label,
    fieldType: field.fieldType,
    value: field.value ?? "",
    keepExistingValue: field.isSensitive,
    isSensitive: field.isSensitive,
  }))
}

export function VaultEditorDialog({
  editor,
  categories,
  onClose,
  onSaveCategory,
  onSaveWebsite,
  onSaveAccount,
}: VaultEditorDialogProps) {
  const [name, setName] = useState(
    editor.kind === "category"
      ? (editor.category?.name ?? "")
      : editor.kind === "website"
        ? (editor.website?.name ?? "")
        : (editor.account?.displayName ?? ""),
  )
  const [categoryId, setCategoryId] = useState(
    editor.kind === "website" ? editor.website?.categoryId ?? editor.categoryId : "",
  )
  const [primaryUrl, setPrimaryUrl] = useState(
    editor.kind === "website" ? (editor.website?.primaryUrl ?? "") : "",
  )
  const [fields, setFields] = useState<EditableField[]>(
    editor.kind === "account" ? initialFields(editor.account) : [],
  )
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError("")
    try {
      if (editor.kind === "category") {
        await onSaveCategory(editor.category?.id, name)
      } else if (editor.kind === "website") {
        await onSaveWebsite({
          id: editor.website?.id,
          categoryId,
          name,
          primaryUrl,
        })
      } else {
        await onSaveAccount({
          id: editor.account?.id,
          websiteId: editor.websiteId,
          displayName: name,
          fields: fields.map(({ clientId: _clientId, ...field }) => ({
            ...field,
            value: field.keepExistingValue ? null : field.value,
          })),
        })
      }
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败，请重试。")
    } finally {
      setPending(false)
    }
  }

  function updateField(clientId: string, update: Partial<EditableField>) {
    setFields((current) =>
      current.map((field) => (field.clientId === clientId ? { ...field, ...update } : field)),
    )
  }

  const title =
    editor.kind === "category"
      ? editor.category
        ? "重命名分类"
        : "新建分类"
      : editor.kind === "website"
        ? editor.website
          ? "编辑网站"
          : "新建网站"
        : editor.account
          ? "编辑账号"
          : "添加账号"

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className={editor.kind === "account" ? "sm:max-w-3xl" : "sm:max-w-md"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {editor.kind === "account"
              ? "账号和全部字段会在同一事务中保存。留空的已有敏感字段会保留原值。"
              : "名称会在保存前执行统一规范化和长度校验。"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <FieldGroup>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="entity-name">
                {editor.kind === "account" ? "账号显示名称" : "名称"}
              </FieldLabel>
              <Input
                id="entity-name"
                autoFocus
                aria-invalid={Boolean(error)}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>

            {editor.kind === "website" ? (
              <>
                <Field>
                  <FieldLabel>所属分类</FieldLabel>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="选择分类" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {categories.map((category) => (
                          <SelectItem value={category.id} key={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="website-url">主网址</FieldLabel>
                  <Input
                    id="website-url"
                    type="url"
                    placeholder="https://example.com/login"
                    value={primaryUrl}
                    onChange={(event) => setPrimaryUrl(event.target.value)}
                  />
                </Field>
              </>
            ) : null}

            {editor.kind === "account" ? (
              <Field>
                <div className="editor-section-heading">
                  <FieldLabel>账号字段</FieldLabel>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFields((current) => [...current, newField()])}
                  >
                    <Plus data-icon="inline-start" />
                    添加字段
                  </Button>
                </div>
                <div className="field-editor-list">
                  {fields.map((field) => {
                    const forcedSensitive =
                      field.fieldType === "password" || field.systemRole === "password"
                    return (
                      <div className="field-editor-row" key={field.clientId}>
                        <Input
                          aria-label="字段名称"
                          placeholder="字段名称"
                          value={field.label}
                          onChange={(event) =>
                            updateField(field.clientId, { label: event.target.value })
                          }
                        />
                        <Select
                          value={field.systemRole ?? "custom"}
                          onValueChange={(value) =>
                            updateField(field.clientId, {
                              systemRole: value === "custom" ? null : (value as SystemRole),
                              isSensitive: value === "password" ? true : field.isSensitive,
                            })
                          }
                        >
                          <SelectTrigger aria-label="系统角色" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="custom">自定义</SelectItem>
                              {systemRoles.map((role) => (
                                <SelectItem value={role.value} key={role.value}>
                                  {role.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <Select
                          value={field.fieldType}
                          onValueChange={(value) =>
                            updateField(field.clientId, {
                              fieldType: value as FieldType,
                              isSensitive: value === "password" ? true : field.isSensitive,
                            })
                          }
                        >
                          <SelectTrigger aria-label="字段类型" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {fieldTypes.map((type) => (
                                <SelectItem value={type.value} key={type.value}>
                                  {type.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <Input
                          aria-label={`${field.label || "字段"}的值`}
                          type={field.fieldType === "password" ? "password" : "text"}
                          placeholder={field.keepExistingValue ? "留空以保留现有值" : "字段值"}
                          value={field.value ?? ""}
                          onChange={(event) =>
                            updateField(field.clientId, {
                              value: event.target.value,
                              keepExistingValue: false,
                            })
                          }
                        />
                        <label className="sensitive-toggle">
                          <Checkbox
                            checked={field.isSensitive}
                            disabled={forcedSensitive}
                            onCheckedChange={(checked) =>
                              updateField(field.clientId, { isSensitive: checked === true })
                            }
                          />
                          敏感
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`删除${field.label || "字段"}`}
                          onClick={() =>
                            setFields((current) =>
                              current.filter((entry) => entry.clientId !== field.clientId),
                            )
                          }
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </Field>
            ) : null}
            <FieldError>{error}</FieldError>
          </FieldGroup>
          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "正在保存…" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
