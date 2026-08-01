import { describe, expect, it } from "vitest"

import { shouldFocusGlobalSearch } from "./keyboard"

function keyboardEvent(init: KeyboardEventInit) {
  return new KeyboardEvent("keydown", init)
}

describe("global search keyboard shortcut", () => {
  it("accepts Ctrl+K when no modal is open", () => {
    expect(shouldFocusGlobalSearch(keyboardEvent({ key: "k", ctrlKey: true }), false)).toBe(true)
  })

  it("does not escape an open dialog focus trap", () => {
    expect(shouldFocusGlobalSearch(keyboardEvent({ key: "k", ctrlKey: true }), true)).toBe(false)
  })

  it("honors an event already handled by another control", () => {
    const event = keyboardEvent({ key: "k", ctrlKey: true, cancelable: true })
    event.preventDefault()
    expect(shouldFocusGlobalSearch(event, false)).toBe(false)
  })
})
