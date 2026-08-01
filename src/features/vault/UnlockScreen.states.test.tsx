import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"

import { UnlockScreen } from "./UnlockScreen"

vi.mock("@/services/vault-client", () => ({
  vaultClient: {
    listBackups: vi.fn(async () => []),
  },
  VaultClientError: class VaultClientError extends Error {
    code: string

    constructor(code: string, message: string) {
      super(message)
      this.code = code
    }
  },
}))

afterEach(() => cleanup())

describe("UnlockScreen failure state", () => {
  it("keeps an actionable error associated with the field across repeated failures", async () => {
    const onUnlock = vi.fn(async () => {
      throw new Error("TEST ONLY wrong password")
    })

    render(
      <UnlockScreen
        onUnlock={onUnlock}
        onRestore={vi.fn(async () => undefined)}
      />,
    )

    const password = screen.getByLabelText("主密码")
    fireEvent.change(password, { target: { value: "Fictional-Wrong-Password!" } })

    const submit = screen.getByRole("button", { name: "解锁" })
    fireEvent.click(submit)
    await waitFor(() => expect(onUnlock).toHaveBeenCalledTimes(1))
    expect(await screen.findByText("主密码不正确，或保险库已经损坏。")).toHaveAttribute(
      "id",
      "unlock-error",
    )
    expect(password).toHaveAttribute("aria-invalid", "true")

    fireEvent.click(submit)
    await waitFor(() => expect(onUnlock).toHaveBeenCalledTimes(2))
    expect(screen.getByText("主密码不正确，或保险库已经损坏。")).toBeInTheDocument()
  })
})
