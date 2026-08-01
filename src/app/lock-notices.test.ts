import { describe, expect, it } from "vitest"

import { lockNoticeForReason } from "./lock-notices"

describe("lockNoticeForReason", () => {
  it.each([
    "windows_session_lock",
    "windows_session_logoff",
    "windows_session_disconnect",
    "windows_suspend",
    "windows_resume",
  ])("explains native Windows lifecycle reason %s", (reason) => {
    expect(lockNoticeForReason(reason)).toContain("Windows")
  })

  it("never returns an empty notice for an unknown native reason", () => {
    expect(lockNoticeForReason("future_lock_reason")).toBe("保险库已安全锁定。")
  })
})
