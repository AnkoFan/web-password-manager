import { afterEach, describe, expect, it, vi } from "vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import "@testing-library/jest-dom/vitest"

import type { TrashItem } from "@/services/vault-client"

import { TrashView } from "./TrashView"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const items: TrashItem[] = [
  {
    groupId: "TEST-ONLY-GROUP-CATEGORY",
    entityType: "category",
    entityName: "虚构分类",
    deletedAt: 1_700_000_000_000,
  },
  {
    groupId: "TEST-ONLY-GROUP-ACCOUNT",
    entityType: "account",
    entityName: "虚构账号",
    deletedAt: 1_700_000_100_000,
  },
]

function renderTrash(
  onRestore = vi.fn().mockResolvedValue(undefined),
  onPermanentlyDelete = vi.fn().mockResolvedValue(undefined),
) {
  return {
    onRestore,
    onPermanentlyDelete,
    ...render(
      <TrashView
        items={items}
        onRestore={onRestore}
        onPermanentlyDelete={onPermanentlyDelete}
      />,
    ),
  }
}

describe("TrashView batch operations", () => {
  it("restores only explicitly selected groups after confirming the exact count", async () => {
    const { onRestore } = renderTrash()
    fireEvent.click(screen.getByRole("checkbox", { name: "选择虚构分类" }))
    fireEvent.click(screen.getByRole("checkbox", { name: "选择虚构账号" }))
    const trigger = screen.getByRole("button", { name: "恢复所选（2）" })
    fireEvent.click(trigger)

    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "明确勾选的 2 个批次",
    )
    fireEvent.click(screen.getByRole("button", { name: "确认恢复" }))

    await waitFor(() =>
      expect(onRestore).toHaveBeenCalledWith([
        "TEST-ONLY-GROUP-CATEGORY",
        "TEST-ONLY-GROUP-ACCOUNT",
      ]),
    )
  })

  it("explains descendant deletion and the non-secure-erase boundary", async () => {
    renderTrash()
    fireEvent.click(screen.getByRole("checkbox", { name: "选择虚构分类" }))
    const trigger = screen.getByRole("button", { name: "永久删除（1）" })
    fireEvent.click(trigger)

    const dialog = screen.getByRole("alertdialog")
    expect(dialog).toHaveTextContent("全部子项")
    expect(dialog).toHaveTextContent("无法恢复")
    expect(dialog).toHaveTextContent("不等同于 SSD")
    fireEvent.click(screen.getByRole("button", { name: "取消" }))

    await waitFor(() => expect(trigger).toHaveFocus())
  })
})
