// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { PrimaryNavigation } from "./PrimaryNavigation"
import { TopBar } from "./TopBar"

afterEach(cleanup)

describe("vault lock buttons", () => {
  it("does not forward the React click event from the top bar", () => {
    const onLock = vi.fn(async () => undefined)
    render(
      <TopBar
        breadcrumbs={["保险库"]}
        query=""
        onQueryChange={() => undefined}
        onLock={onLock}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "锁定" }))

    expect(onLock).toHaveBeenCalledOnce()
    expect(onLock).toHaveBeenCalledWith()
  })

  it("does not forward the React click event from primary navigation", () => {
    const onLock = vi.fn(async () => undefined)
    render(
      <PrimaryNavigation
        activeView="vault"
        onNavigate={() => undefined}
        onLock={onLock}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "锁定" }))

    expect(onLock).toHaveBeenCalledOnce()
    expect(onLock).toHaveBeenCalledWith()
  })
})
