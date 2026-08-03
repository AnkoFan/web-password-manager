import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"

import type { AccountDetail, AccountDraft } from "@/services/vault-client"

import { AccountDetailDialog } from "./AccountDetailDialog"

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const account: AccountDetail = {
  id: "TEST-ONLY-ACCOUNT",
  websiteId: "TEST-ONLY-WEBSITE",
  displayName: "虚构账号",
  fields: [
    {
      id: "TEST-ONLY-USERNAME",
      systemRole: "username",
      label: "用户名",
      fieldType: "text",
      value: "fictional-user",
      isSensitive: false,
      sortOrder: 0,
    },
    {
      id: "TEST-ONLY-PASSWORD",
      systemRole: "password",
      label: "密码",
      fieldType: "password",
      value: null,
      isSensitive: true,
      sortOrder: 1,
    },
    {
      id: "TEST-ONLY-EMAIL",
      systemRole: "email",
      label: "主邮箱",
      fieldType: "email",
      value: "m5@example.test",
      isSensitive: false,
      sortOrder: 2,
    },
    {
      id: "TEST-ONLY-NOTE",
      systemRole: "note",
      label: "备注",
      fieldType: "multiline",
      value: "仅供测试的非敏感备注",
      isSensitive: false,
      sortOrder: 3,
    },
    {
      id: "TEST-ONLY-TOKEN",
      systemRole: null,
      label: "Token",
      fieldType: "password",
      value: null,
      isSensitive: true,
      sortOrder: 4,
    },
    {
      id: "TEST-ONLY-REGION",
      systemRole: null,
      label: "Region",
      fieldType: "text",
      value: "west-test",
      isSensitive: false,
      sortOrder: 5,
    },
  ],
}

function renderDialog(onSave: (draft: AccountDraft) => Promise<void>) {
  return render(
    <AccountDetailDialog
      account={account}
      websiteName="虚构网站"
      revealed={{}}
      onClose={vi.fn()}
      onSave={onSave}
      onToggleReveal={vi.fn().mockResolvedValue(undefined)}
      onCopyField={vi.fn().mockResolvedValue(undefined)}
    />,
  )
}

describe("AccountDetailDialog", () => {
  it("saves fixed system fields and ordered custom fields atomically", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    renderDialog(onSave)

    expect(screen.getByRole("dialog", { name: "账号详情" })).toBeInTheDocument()
    expect(screen.getByLabelText("主邮箱（可选）")).toHaveValue("m5@example.test")
    expect(screen.getByLabelText("备注（可选）")).toHaveAttribute("rows", "5")
    expect(screen.getByText("备注固定为非敏感多行字段，不进入搜索索引。")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "上移字段 2" }))
    fireEvent.click(screen.getByRole("button", { name: "添加自定义字段" }))
    const labels = screen.getAllByLabelText("字段名称")
    const values = screen.getAllByLabelText("字段内容")
    fireEvent.change(labels.at(-1)!, { target: { value: "测试字段" } })
    fireEvent.change(values.at(-1)!, { target: { value: "TEST-ONLY-VALUE" } })
    fireEvent.click(screen.getAllByLabelText("敏感字段，默认隐藏").at(-1)!)
    fireEvent.click(screen.getByRole("button", { name: "保存全部更改" }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const draft = onSave.mock.calls[0][0] as AccountDraft
    expect(draft.fields.filter((field) => field.systemRole === "email")).toHaveLength(1)
    expect(draft.fields.find((field) => field.systemRole === "email")).toMatchObject({
      fieldType: "email",
      value: "m5@example.test",
      isSensitive: false,
    })
    expect(draft.fields.find((field) => field.systemRole === "note")).toMatchObject({
      fieldType: "multiline",
      value: "仅供测试的非敏感备注",
      isSensitive: false,
    })
    expect(draft.fields.find((field) => field.systemRole === "password")).toMatchObject({
      value: null,
      keepExistingValue: true,
      isSensitive: true,
    })
    expect(
      draft.fields.filter((field) => field.systemRole == null).map((field) => field.label),
    ).toEqual(["Region", "Token", "测试字段"])
    expect(draft.fields.at(-1)).toMatchObject({
      value: "TEST-ONLY-VALUE",
      isSensitive: true,
    })
  })

  it("omits cleared optional email and note fields", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    renderDialog(onSave)

    fireEvent.change(screen.getByLabelText("主邮箱（可选）"), { target: { value: "" } })
    fireEvent.change(screen.getByLabelText("备注（可选）"), { target: { value: "" } })
    fireEvent.click(screen.getByRole("button", { name: "保存全部更改" }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const draft = onSave.mock.calls[0][0] as AccountDraft
    expect(draft.fields.some((field) => field.systemRole === "email")).toBe(false)
    expect(draft.fields.some((field) => field.systemRole === "note")).toBe(false)
  })
})
