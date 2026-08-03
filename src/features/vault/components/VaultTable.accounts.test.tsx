import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"

import { vaultClient, type AccountDetail, type AccountDraft, type Website } from "@/services/vault-client"

import {
  accountMatchesSafeFilter,
  VaultTable,
  type VaultEntry,
} from "./VaultTable"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const website: Website = {
  id: "TEST-ONLY-WEBSITE",
  categoryId: "TEST-ONLY-CATEGORY",
  name: "虚构网站",
  primaryUrl: "https://vault-table.example.test",
  sortOrder: 0,
}

function account(id: string, displayName: string): AccountDetail {
  return {
    id,
    websiteId: website.id,
    displayName,
    fields: [
      {
        id: `${id}-username`,
        systemRole: "username",
        label: "用户名",
        fieldType: "text",
        value: `${id}@example.test`,
        isSensitive: false,
        sortOrder: 0,
      },
      {
        id: `${id}-password`,
        systemRole: "password",
        label: "密码",
        fieldType: "password",
        value: null,
        isSensitive: true,
        sortOrder: 1,
      },
    ],
  }
}

function table(
  entries: VaultEntry[],
  filterQuery = "",
  onSaveAccount: (draft: AccountDraft) => Promise<void> = vi.fn().mockResolvedValue(undefined),
) {
  return (
    <VaultTable
      category={{ id: website.categoryId, name: "虚构分类", sortOrder: 0 }}
      entries={entries}
      filterQuery={filterQuery}
      selectedAccountId={null}
      selectedWebsiteIds={new Set()}
      revealed={{}}
      onCreateWebsite={vi.fn()}
      onEditWebsite={vi.fn()}
      onDeleteWebsite={vi.fn()}
      onWebsiteSelectionChange={vi.fn()}
      onDeleteSelectedWebsites={vi.fn()}
      onSaveAccount={onSaveAccount}
      onEditAccount={vi.fn()}
      onDeleteAccount={vi.fn()}
      onOpenWebsite={vi.fn().mockResolvedValue(undefined)}
      onToggleReveal={vi.fn().mockResolvedValue(undefined)}
      onCopyField={vi.fn().mockResolvedValue(undefined)}
    />
  )
}

function renderTable(entries: VaultEntry[], filterQuery = "") {
  return render(table(entries, filterQuery))
}

describe("VaultTable account grouping", () => {
  it("keeps account inputs equal and exposes compact icon-only row actions", () => {
    renderTable([{ website, account: account("TEST-ONLY-ACCOUNT-1", "虚构账号") }])

    expect(screen.getByLabelText("虚构网站 的账号名称")).toHaveClass("vault-account-input")
    expect(screen.getByLabelText("虚构网站 的登录账号")).toHaveClass("vault-account-input")
    expect(screen.getByLabelText("虚构网站 的密码")).toHaveClass("vault-account-input")

    for (const label of ["保存账号", "打开网址", "编辑账号详情", "删除账号"]) {
      const action = screen.getByRole("button", { name: label })
      expect(action).toHaveAttribute("data-size", "icon-sm")
      expect(action).toHaveAttribute("title", label)
      expect(action).toHaveTextContent("")
    }
  })

  it("shows one add control and collapses continuation account rows", () => {
    const firstAccount = account("TEST-ONLY-ACCOUNT-1", "虚构账号一")
    const secondAccount = account("TEST-ONLY-ACCOUNT-2", "虚构账号二")
    renderTable([
      { website, account: firstAccount },
      { website, account: secondAccount },
    ])

    expect(screen.getAllByRole("button", { name: "添加账号" })).toHaveLength(1)
    const websiteTitleRow = screen.getByText("虚构网站").closest(".vault-website-title-row")
    const editWebsite = screen.getByRole("button", { name: "编辑网站 虚构网站" })
    const deleteWebsite = screen.getByRole("button", { name: "删除网站 虚构网站" })
    expect(editWebsite.closest(".vault-website-title-row")).toBe(websiteTitleRow)
    expect(deleteWebsite.closest(".vault-website-title-row")).toBe(websiteTitleRow)
    expect(editWebsite).toHaveAttribute("data-size", "icon-xs")
    expect(deleteWebsite).toHaveAttribute("data-size", "icon-xs")
    const secondRow = screen.getByDisplayValue("虚构账号二").closest("tr")
    expect(secondRow).toHaveAttribute("hidden")

    fireEvent.click(screen.getByRole("button", { name: "展开其余 1 个账号" }))

    expect(secondRow).not.toHaveAttribute("hidden")
    expect(screen.getByRole("button", { name: "收起其余 1 个账号" })).toHaveAttribute(
      "aria-expanded",
      "true",
    )
  })

  it("filters only by website, account name, username, or email", () => {
    const firstAccount = account("TEST-ONLY-ACCOUNT-1", "虚构账号一")
    const secondAccount = account("TEST-ONLY-ACCOUNT-2", "虚构账号二")
    secondAccount.fields.push({
      id: "TEST-ONLY-NOTE",
      systemRole: "note",
      label: "备注",
      fieldType: "multiline",
      value: "TEST-ONLY-HIDDEN-NEEDLE",
      isSensitive: false,
      sortOrder: 2,
    })
    secondAccount.fields.push({
      id: "TEST-ONLY-EMAIL",
      systemRole: "email",
      label: "主邮箱",
      fieldType: "email",
      value: "m5-filter@example.test",
      isSensitive: false,
      sortOrder: 3,
    })

    expect(accountMatchesSafeFilter(secondAccount, "TEST-ONLY-ACCOUNT-2@example.test")).toBe(true)
    expect(accountMatchesSafeFilter(secondAccount, "TEST-ONLY-HIDDEN-NEEDLE")).toBe(false)
    expect(accountMatchesSafeFilter(secondAccount, "m5-filter@example.test")).toBe(true)

    renderTable(
      [
        { website, account: firstAccount },
        { website, account: secondAccount },
      ],
      "TEST-ONLY-ACCOUNT-2@example.test",
    )

    expect(screen.getByDisplayValue("虚构账号一").closest("tr")).toHaveAttribute("hidden")
    const matchingRow = screen.getByDisplayValue("虚构账号二").closest("tr")
    expect(matchingRow).not.toHaveAttribute("hidden")
    expect(matchingRow).toHaveTextContent("虚构网站")
  })

  it("keeps an unsaved account draft mounted while the filter changes", () => {
    const firstAccount = account("TEST-ONLY-ACCOUNT-1", "虚构账号一")
    const entries = [{ website, account: firstAccount }]
    const { rerender } = renderTable(entries)

    fireEvent.click(screen.getByRole("button", { name: "添加账号" }))
    const draftName = screen.getAllByLabelText("虚构网站 的账号名称").at(-1)!
    fireEvent.change(draftName, { target: { value: "仅用于测试的草稿" } })

    rerender(table(entries, "不存在的筛选值"))
    expect(draftName.closest("tr")).toHaveAttribute("hidden")
    rerender(table(entries))

    expect(screen.getByDisplayValue("仅用于测试的草稿")).toBeInTheDocument()
  })

  it("fills a generated password hidden without saving the account", async () => {
    const generatedPassword = "A7!generated-test-value"
    vi.spyOn(vaultClient, "generatePassword").mockResolvedValue(generatedPassword)
    const saveAccount = vi.fn().mockResolvedValue(undefined)
    render(table([{ website, account: account("TEST-ONLY-ACCOUNT-1", "虚构账号") }], "", saveAccount))

    const generatorButton = screen.getByRole("button", { name: "生成密码" })
    fireEvent.click(generatorButton)
    expect(screen.getByRole("dialog", { name: "生成密码" })).toBeInTheDocument()
    expect(screen.getByLabelText("长度")).toHaveValue(20)
    fireEvent.click(screen.getByRole("button", { name: "生成并填入" }))

    await waitFor(() =>
      expect(screen.getByLabelText("虚构网站 的密码")).toHaveValue(generatedPassword),
    )
    expect(screen.getByLabelText("虚构网站 的密码")).toHaveAttribute("type", "password")
    expect(saveAccount).not.toHaveBeenCalled()
    await waitFor(() => expect(generatorButton).toHaveFocus())
    expect(vaultClient.generatePassword).toHaveBeenCalledWith({
      length: 20,
      lowercase: true,
      uppercase: true,
      digits: true,
      symbols: true,
    })
  })
})
