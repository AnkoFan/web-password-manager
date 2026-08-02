import { useState } from "react"
import { Dices } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  vaultClient,
  type PasswordGeneratorOptions,
} from "@/services/vault-client"

type PasswordGeneratorButtonProps = {
  onGenerated: (password: string) => void
}

const defaultOptions: PasswordGeneratorOptions = {
  length: 20,
  lowercase: true,
  uppercase: true,
  digits: true,
  symbols: true,
}

const characterOptions: Array<{
  key: keyof Omit<PasswordGeneratorOptions, "length">
  label: string
}> = [
  { key: "lowercase", label: "小写字母" },
  { key: "uppercase", label: "大写字母" },
  { key: "digits", label: "数字" },
  { key: "symbols", label: "符号" },
]

export function PasswordGeneratorButton({ onGenerated }: PasswordGeneratorButtonProps) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState(defaultOptions)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const hasCharacterClass = characterOptions.some(({ key }) => options[key])

  async function generate() {
    setPending(true)
    setError("")
    try {
      const password = await vaultClient.generatePassword(options)
      onGenerated(password)
      setOpen(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法生成密码，请重试。")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) setError("")
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="生成密码"
          title="生成密码"
        >
          <Dices />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>生成密码</DialogTitle>
          <DialogDescription>
            密码在本机离线生成，填入当前密码框后仍需点击保存。
          </DialogDescription>
        </DialogHeader>
        <div className="password-generator-form">
          <label htmlFor="password-generator-length">
            <span>长度</span>
            <Input
              id="password-generator-length"
              type="number"
              min={8}
              max={128}
              value={options.length}
              onChange={(event) =>
                setOptions((current) => ({
                  ...current,
                  length: Number(event.target.value),
                }))
              }
            />
          </label>
          <fieldset>
            <legend>字符类型</legend>
            <div className="password-generator-classes">
              {characterOptions.map(({ key, label }) => (
                <label key={key}>
                  <Checkbox
                    checked={options[key]}
                    onCheckedChange={(checked) =>
                      setOptions((current) => ({ ...current, [key]: checked === true }))
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {error ? <p className="password-generator-error">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button
            type="button"
            disabled={
              pending ||
              !Number.isInteger(options.length) ||
              options.length < 8 ||
              options.length > 128 ||
              !hasCharacterClass
            }
            onClick={() => void generate()}
          >
            {pending ? "生成中…" : "生成并填入"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
