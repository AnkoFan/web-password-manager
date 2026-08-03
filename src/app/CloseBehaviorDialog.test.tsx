import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"

import { CloseBehaviorDialog } from "./CloseBehaviorDialog"

afterEach(cleanup)

describe("CloseBehaviorDialog", () => {
  it("offers exit, tray minimization, and cancellation", async () => {
    const choose = vi.fn().mockResolvedValue(undefined)
    const cancel = vi.fn()

    render(<CloseBehaviorDialog open onCancel={cancel} onChoose={choose} />)

    expect(screen.getByRole("alertdialog")).toHaveTextContent("随时在设置中更改")
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "最小化至托盘" }))
    await waitFor(() => expect(choose).toHaveBeenCalledWith("minimizeToTray"))

    fireEvent.click(screen.getByRole("button", { name: "关闭程序" }))
    await waitFor(() => expect(choose).toHaveBeenCalledWith("exit"))
  })
})
