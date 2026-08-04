import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { AccountDetail, Category, Website } from "@/services/vault-client"

import { VaultWorkspace } from "./VaultWorkspace"

const category: Category = {
  id: "TEST-ONLY-CATEGORY",
  name: "虚构分类",
  sortOrder: 0,
}

const website: Website = {
  id: "TEST-ONLY-WEBSITE",
  categoryId: category.id,
  name: "虚构网站",
  primaryUrl: "https://workspace.example.test/",
  sortOrder: 0,
}

const account: AccountDetail = {
  id: "TEST-ONLY-ACCOUNT",
  websiteId: website.id,
  displayName: "虚构账号",
  fields: [
    {
      id: "TEST-ONLY-USERNAME",
      systemRole: "username",
      label: "用户名",
      fieldType: "text",
      value: "workspace@example.test",
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
  ],
}

afterEach(cleanup)

function renderWorkspace(overrides: Record<string, unknown> = {}) {
  const props = {
    category,
    entries: [{ website, account }],
    selectedWebsiteId: website.id,
    selectedAccountId: account.id,
    selectedWebsiteIds: new Set<string>(),
    revealed: {},
    onSelectWebsite: vi.fn(),
    onSelectAccount: vi.fn(),
    onCreateWebsite: vi.fn(),
    onEditWebsite: vi.fn(),
    onDeleteWebsite: vi.fn(),
    onWebsiteSelectionChange: vi.fn(),
    onDeleteSelectedWebsites: vi.fn(),
    onSaveAccount: vi.fn().mockResolvedValue(undefined),
    onEditAccount: vi.fn(),
    onDeleteAccount: vi.fn(),
    onOpenWebsite: vi.fn().mockResolvedValue(undefined),
    onToggleReveal: vi.fn().mockResolvedValue(undefined),
    onCopyField: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
  return { ...render(<VaultWorkspace {...props} />), props }
}

describe("VaultWorkspace", () => {
  it("renders the website, account list, and selected account details together", () => {
    renderWorkspace()

    expect(screen.getByRole("region", { name: "网站列表" })).toHaveTextContent("虚构网站")
    expect(screen.getByRole("region", { name: "账号工作区" })).toHaveTextContent("虚构账号")
    expect(screen.getByRole("region", { name: "虚构账号的账号详情" })).toHaveTextContent(
      "workspace@example.test",
    )
    expect(screen.getByRole("button", { name: "编辑账号详情" })).toBeInTheDocument()
  })

  it("creates a basic account from the focused website without exposing the password", async () => {
    const onSaveAccount = vi.fn().mockResolvedValue(undefined)
    renderWorkspace({ entries: [{ website, account: null }], selectedAccountId: null, onSaveAccount })

    const addButtons = screen.getAllByRole("button", { name: "添加账号" })
    fireEvent.click(addButtons[0])
    fireEvent.change(screen.getByLabelText("账号名称"), { target: { value: "新账号" } })
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "new@example.test" } })
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "TEST-ONLY-secret" } })
    expect(screen.getByLabelText("密码")).toHaveAttribute("type", "password")
    fireEvent.click(screen.getByRole("button", { name: "保存账号" }))

    await waitFor(() => expect(onSaveAccount).toHaveBeenCalledTimes(1))
    expect(onSaveAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        websiteId: website.id,
        displayName: "新账号",
        fields: expect.arrayContaining([
          expect.objectContaining({ systemRole: "password", isSensitive: true }),
        ]),
      }),
    )
  })
})
