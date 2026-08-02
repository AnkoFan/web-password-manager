import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"

import type { AccountDetail, Website } from "@/services/vault-client"

import { VaultTable, type VaultEntry } from "./VaultTable"

afterEach(() => cleanup())

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

function renderTable(entries: VaultEntry[]) {
  render(
    <VaultTable
      category={{ id: website.categoryId, name: "虚构分类", sortOrder: 0 }}
      entries={entries}
      selectedAccountId={null}
      selectedWebsiteIds={new Set()}
      revealed={{}}
      onCreateWebsite={vi.fn()}
      onEditWebsite={vi.fn()}
      onDeleteWebsite={vi.fn()}
      onWebsiteSelectionChange={vi.fn()}
      onDeleteSelectedWebsites={vi.fn()}
      onSaveAccount={vi.fn().mockResolvedValue(undefined)}
      onDeleteAccount={vi.fn()}
      onOpenWebsite={vi.fn().mockResolvedValue(undefined)}
      onToggleReveal={vi.fn().mockResolvedValue(undefined)}
      onCopyField={vi.fn().mockResolvedValue(undefined)}
    />,
  )
}

describe("VaultTable account grouping", () => {
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
})
