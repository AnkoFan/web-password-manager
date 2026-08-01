import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"

import { App } from "./App"

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  onLocked: vi.fn(async () => () => undefined),
}))

vi.mock("@/services/vault-client", () => ({
  vaultClient: mocks,
}))

afterEach(() => {
  cleanup()
  mocks.status.mockReset()
  mocks.onLocked.mockClear()
})

describe("App startup states", () => {
  it("announces the loading state while checking the vault", () => {
    mocks.status.mockImplementation(() => new Promise(() => undefined))

    render(<App />)

    expect(screen.getByRole("main", { name: "正在检查本地保险库" })).toHaveAttribute(
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
    expect(alert).toHaveTextContent("先保留应用数据目录的副本")
    expect(alert).toHaveTextContent("不要删除原文件")

    fireEvent.click(screen.getByRole("button", { name: "重新检查保险库" }))

    await waitFor(() => expect(mocks.status).toHaveBeenCalledTimes(2))
    expect(screen.getByRole("main", { name: "正在检查本地保险库" })).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })
})
