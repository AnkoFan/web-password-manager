import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { afterEach, describe, expect, it, vi } from "vitest"

import { App } from "./App"

const mocks = vi.hoisted(() => ({
  status: vi.fn().mockResolvedValue({ exists: true }),
  closeHandler: null as (() => void) | null,
  onCloseRequested: vi.fn(async (handler: () => void) => {
    mocks.closeHandler = handler
    return () => undefined
  }),
  getAppSettings: vi.fn().mockResolvedValue({
    clipboardClearSeconds: 30,
    closeBehavior: "ask",
    accentColor: "oceanBlue",
  }),
  updateAppSettings: vi.fn(async (settings) => settings),
  applyCloseAction: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/services/vault-client", () => ({ vaultClient: mocks }))
vi.mock("@/features/vault/AppShell", () => ({
  AppShell: () => <main>TEST ONLY vault ready</main>,
}))

afterEach(() => {
  cleanup()
  mocks.closeHandler = null
  mocks.onCloseRequested.mockClear()
  mocks.getAppSettings.mockClear()
  mocks.updateAppSettings.mockClear()
  mocks.applyCloseAction.mockClear()
})

describe("App close behavior", () => {
  it("persists the first tray choice before applying it", async () => {
    render(<App />)
    await screen.findByText("TEST ONLY vault ready")
    expect(document.documentElement).toHaveAttribute("data-accent", "oceanBlue")
    await waitFor(() => expect(mocks.closeHandler).not.toBeNull())

    act(() => mocks.closeHandler?.())
    fireEvent.click(await screen.findByRole("button", { name: "最小化至托盘" }))

    await waitFor(() =>
      expect(mocks.updateAppSettings).toHaveBeenCalledWith({
        clipboardClearSeconds: 30,
        closeBehavior: "minimizeToTray",
        accentColor: "oceanBlue",
      }),
    )
    expect(mocks.applyCloseAction).toHaveBeenCalledWith("minimizeToTray")
    expect(mocks.updateAppSettings.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.applyCloseAction.mock.invocationCallOrder[0],
    )
  })
})
