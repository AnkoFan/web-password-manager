import { useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
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
  Category,
  Website,
  WebsiteDraft,
} from "@/services/vault-client"

export type EditorState =
  | { kind: "category"; category?: Category }
  | { kind: "website"; website?: Website; categoryId: string }

type VaultEditorDialogProps = {
  editor: EditorState
  categories: Category[]
  onClose: () => void
  onSaveCategory: (id: string | undefined, name: string) => Promise<void>
  onSaveWebsite: (draft: WebsiteDraft) => Promise<void>
}

export function VaultEditorDialog({
  editor,
  categories,
  onClose,
  onSaveCategory,
  onSaveWebsite,
}: VaultEditorDialogProps) {
  const [name, setName] = useState(
    editor.kind === "category"
      ? (editor.category?.name ?? "")
      : (editor.website?.name ?? ""),
  )
  const [categoryId, setCategoryId] = useState(
    editor.kind === "website" ? editor.website?.categoryId ?? editor.categoryId : "",
  )
  const [primaryUrl, setPrimaryUrl] = useState(
    editor.kind === "website" ? (editor.website?.primaryUrl ?? "") : "",
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
      } else {
        await onSaveWebsite({
          id: editor.website?.id,
          categoryId,
          name,
          primaryUrl,
        })
      }
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败，请重试。")
    } finally {
      setPending(false)
    }
  }

  const title =
    editor.kind === "category"
      ? editor.category
        ? "重命名分类"
        : "新建分类"
      : editor.website
        ? "编辑网站"
        : "新建网站"

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>名称会在保存前执行统一规范化和长度校验。</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <FieldGroup>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="entity-name">名称</FieldLabel>
              <Input
                id="entity-name"
                autoFocus
                aria-describedby={error ? "editor-error" : undefined}
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
            <FieldError id="editor-error">{error}</FieldError>
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
