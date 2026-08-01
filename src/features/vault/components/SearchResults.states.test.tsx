import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"

import { SearchResults } from "./SearchResults"

afterEach(() => cleanup())

describe("SearchResults empty state", () => {
  it("explains safe searchable fields and the next query to try", () => {
    render(<SearchResults query="TEST-ONLY-NO-MATCH" results={[]} onSelect={vi.fn()} />)

    expect(screen.getByText("没有匹配结果")).toBeInTheDocument()
    expect(screen.getByText(/请尝试网站、账号、用户名或邮箱/)).toBeInTheDocument()
    expect(screen.getByText(/不会匹配密码、Token 或其他敏感字段/)).toBeInTheDocument()
  })
})
