import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"

import { AppShell } from "./AppShell"

vi.mock("@/services/vault-client", () => ({
  vaultClient: {
    listCategories: vi.fn(async () => [
      { id: "category-test-only", name: "M3 Keyboard Test" },
    ]),
    listWebsites: vi.fn(async () => []),
    listTrash: vi.fn(async () => []),
    recordActivity: vi.fn(async () => undefined),
  },
}))

afterEach(() => cleanup())

describe("AppShell dialog focus restoration", () => {
  it("returns focus to the editor trigger after Escape", async () => {
    render(<AppShell onLock={vi.fn(async () => undefined)} />)
    const trigger = await screen.findByRole("button", { name: "新建分类" })

    trigger.focus()
    fireEvent.click(trigger)
    expect(await screen.findByRole("dialog")).toBeInTheDocument()

    fireEvent.keyDown(document, { key: "Escape", code: "Escape" })

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it("returns focus to the delete trigger after Escape", async () => {
    render(<AppShell onLock={vi.fn(async () => undefined)} />)
    const trigger = await screen.findByRole("button", { name: "删除" })

    trigger.focus()
    fireEvent.click(trigger)
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument()

    fireEvent.keyDown(document, { key: "Escape", code: "Escape" })

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })
})
