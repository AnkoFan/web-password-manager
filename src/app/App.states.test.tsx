import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"

import { App } from "./App"

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
}))

vi.mock("@/services/vault-client", () => ({
  vaultClient: mocks,
}))

afterEach(() => {
  cleanup()
  mocks.status.mockReset()
})

describe("App startup states", () => {
  it("announces the loading state while checking the vault", () => {
    mocks.status.mockImplementation(() => new Promise(() => undefined))

    render(<App />)

    expect(screen.getByRole("main", { name: "正在检查本地数据库" })).toHaveAttribute(
      "aria-live",
      "polite",
    )
  })

  it("offers a safe retry after a startup failure", async () => {
    mocks.status
      .mockRejectedValueOnce(new Error("TEST ONLY storage unavailable"))
      .mockImplementationOnce(() => new Promise(() => undefined))

    render(<App />)

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("复制应用数据目录")
    expect(alert).toHaveTextContent("恢复已验证的明文备份")

    fireEvent.click(screen.getByRole("button", { name: "重新检查数据库" }))

    await waitFor(() => expect(mocks.status).toHaveBeenCalledTimes(2))
    expect(screen.getByRole("main", { name: "正在检查本地数据库" })).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })
})
