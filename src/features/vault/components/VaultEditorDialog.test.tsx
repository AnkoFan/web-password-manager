import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { afterEach, describe, expect, it, vi } from "vitest"

import { VaultEditorDialog } from "./VaultEditorDialog"

const props = {
  editor: { kind: "website" as const, categoryId: "TEST-ONLY-CATEGORY" },
  categories: [{ id: "TEST-ONLY-CATEGORY", name: "虚构分类", sortOrder: 0 }],
  onClose: vi.fn(),
  onSaveCategory: vi.fn().mockResolvedValue(undefined),
  onSaveWebsite: vi.fn().mockResolvedValue(undefined),
}

afterEach(cleanup)

describe("VaultEditorDialog website name resolution", () => {
  it("fills an empty name when the URL loses focus", async () => {
    const onResolveWebsiteName = vi.fn().mockResolvedValue("示例网站")
    render(<VaultEditorDialog {...props} onResolveWebsiteName={onResolveWebsiteName} />)

    fireEvent.change(screen.getByLabelText("主网址"), {
      target: { value: "https://example.test/login" },
    })
    fireEvent.blur(screen.getByLabelText("主网址"))

    await waitFor(() => expect(screen.getByLabelText("名称")).toHaveValue("示例网站"))
    expect(onResolveWebsiteName).toHaveBeenCalledWith("https://example.test/login")
  })

  it("does not overwrite a manually entered name", () => {
    const onResolveWebsiteName = vi.fn().mockResolvedValue("远程名称")
    render(<VaultEditorDialog {...props} onResolveWebsiteName={onResolveWebsiteName} />)

    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "我的网站" } })
    fireEvent.change(screen.getByLabelText("主网址"), {
      target: { value: "https://example.test" },
    })
    fireEvent.blur(screen.getByLabelText("主网址"))

    expect(onResolveWebsiteName).not.toHaveBeenCalled()
    expect(screen.getByLabelText("名称")).toHaveValue("我的网站")
  })
})
