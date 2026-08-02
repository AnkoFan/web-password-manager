import { describe, expect, it } from "vitest"

import { sortVaultNames, vaultTextKey } from "./vault-order"

describe("stable vault name ordering", () => {
  it("normalizes names and uses the stable id for equal keys", () => {
    const items = [
      { id: "TEST-ONLY-3", name: "Zulu" },
      { id: "TEST-ONLY-2", name: "ＡLPHA" },
      { id: "TEST-ONLY-1", name: "alpha" },
    ]

    expect(sortVaultNames(items).map((item) => item.id)).toEqual([
      "TEST-ONLY-1",
      "TEST-ONLY-2",
      "TEST-ONLY-3",
    ])
    expect(vaultTextKey("  ＡLPHA ")).toBe("alpha")
    expect(items.map((item) => item.id)).toEqual([
      "TEST-ONLY-3",
      "TEST-ONLY-2",
      "TEST-ONLY-1",
    ])
  })
})
