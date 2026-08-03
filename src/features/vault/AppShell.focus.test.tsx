import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"

import { AppShell } from "./AppShell"

vi.mock("@/services/vault-client", () => ({
  vaultClient: {
    listCategories: vi.fn(async () => [
      { id: "category-test-only", name: "M5 Keyboard Test", sortOrder: 0 },
    ]),
    listWebsites: vi.fn(async () => [
      {
        id: "website-test-only",
        categoryId: "category-test-only",
        name: "M5 Test Website",
        primaryUrl: "https://m5.example.test",
        sortOrder: 0,
      },
    ]),
    listAccounts: vi.fn(async () => [
      {
        id: "account-test-only",
        websiteId: "website-test-only",
        displayName: "M5 Test Account",
        summary: "m5-user",
        sortOrder: 0,
      },
    ]),
    getAccount: vi.fn(async () => ({
      id: "account-test-only",
      websiteId: "website-test-only",
      displayName: "M5 Test Account",
      fields: [
        {
          id: "username-test-only",
          systemRole: "username",
          label: "用户名",
          fieldType: "text",
          value: "m5-user",
          isSensitive: false,
          sortOrder: 0,
        },
        {
          id: "password-test-only",
          systemRole: "password",
          label: "密码",
          fieldType: "password",
          value: null,
          isSensitive: true,
          sortOrder: 1,
        },
      ],
    })),
    listTrash: vi.fn(async () => []),
  },
}))

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

describe("AppShell dialog focus restoration", () => {
  it("returns focus to the editor trigger after Escape", async () => {
    render(<AppShell />)
    const trigger = await screen.findByRole("button", { name: "新建分类" })

    trigger.focus()
    fireEvent.click(trigger)
    expect(await screen.findByRole("dialog")).toBeInTheDocument()

    fireEvent.keyDown(document, { key: "Escape", code: "Escape" })

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it("returns focus to the delete trigger after Escape", async () => {
    render(<AppShell />)
    const trigger = await screen.findByRole("button", { name: "删除" })

    trigger.focus()
    fireEvent.click(trigger)
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument()

    fireEvent.keyDown(document, { key: "Escape", code: "Escape" })

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it("returns focus to the account detail trigger after Escape", async () => {
    render(<AppShell />)
    const trigger = await screen.findByRole("button", { name: "编辑账号详情" })

    trigger.focus()
    fireEvent.click(trigger)
    expect(await screen.findByRole("dialog", { name: "账号详情" })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: "Escape", code: "Escape" })

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })
})
