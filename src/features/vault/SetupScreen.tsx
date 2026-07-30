import { useState, type FormEvent } from "react"
import { CheckCircle2, Eye, EyeOff, HardDrive, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

type SetupScreenProps = {
  onCreate: (password: string) => Promise<void>
}

export function SetupScreen({ onCreate }: SetupScreenProps) {
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [acknowledged, setAcknowledged] = useState(false)
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextError =
      password.length < 12
        ? "主密码至少需要 12 个字符。"
        : password !== confirmation
          ? "两次输入的主密码不一致。"
          : !acknowledged
            ? "请先确认你理解主密码无法找回。"
            : ""

    setError(nextError)
    if (nextError) return

    setPending(true)
    try {
      await onCreate(password)
    } catch {
      setError("创建保险库失败，请重试。")
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-intro">
        <div className="brand-mark">
          <ShieldCheck aria-hidden="true" />
        </div>
        <p className="eyebrow">WebPasswordManager</p>
        <h1>你的账号资料，只留在这台电脑。</h1>
        <p className="auth-lead">
          无需注册，不连接云端。先创建一个主密码，用它保护本机保险库。
        </p>
        <div className="security-points">
          <p><HardDrive aria-hidden="true" /> 数据默认保存在本机应用数据目录</p>
          <p><CheckCircle2 aria-hidden="true" /> 主密码不会保存，也无法由我们找回</p>
        </div>
      </section>

      <Card className="auth-card">
        <CardHeader>
          <CardTitle>创建本地保险库</CardTitle>
          <CardDescription>这是第一次使用时唯一需要完成的安全设置。</CardDescription>
        </CardHeader>
        <form onSubmit={submit}>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="master-password">主密码</FieldLabel>
                <div className="password-control">
                  <Input
                    id="master-password"
                    aria-invalid={Boolean(error)}
                    autoComplete="new-password"
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
                <FieldDescription>建议使用 4 个以上无关词语组合，至少 12 个字符。</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="master-password-confirmation">再次输入</FieldLabel>
                <Input
                  id="master-password-confirmation"
                  autoComplete="new-password"
                  type={visible ? "text" : "password"}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </Field>
              <Field orientation="horizontal">
                <Checkbox
                  id="recovery-acknowledgement"
                  checked={acknowledged}
                  onCheckedChange={(checked) => setAcknowledged(checked === true)}
                />
                <FieldLabel htmlFor="recovery-acknowledgement" className="font-normal">
                  我理解：忘记主密码后，可能无法恢复保险库数据。
                </FieldLabel>
              </Field>
              <FieldError>{error}</FieldError>
            </FieldGroup>
          </CardContent>
          <CardFooter>
            <Button type="submit" size="lg" disabled={pending}>
              <ShieldCheck data-icon="inline-start" />
              {pending ? "正在创建…" : "创建保险库"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  )
}
