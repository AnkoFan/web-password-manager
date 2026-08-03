import type { AccentColor } from "@/services/vault-client"

export const DEFAULT_ACCENT_COLOR: AccentColor = "oceanBlue"

export const ACCENT_COLORS: ReadonlyArray<{
  value: AccentColor
  label: string
  color: string
}> = [
  { value: "oceanBlue", label: "远洋蓝", color: "#3764D6" },
  { value: "indigo", label: "靛青", color: "#4F46E5" },
  { value: "violet", label: "紫罗兰", color: "#7C3AED" },
  { value: "rose", label: "玫红", color: "#C24174" },
  { value: "amber", label: "琥珀", color: "#B86B00" },
  { value: "teal", label: "青绿", color: "#0F766E" },
]

export function applyAccentColor(accentColor: AccentColor = DEFAULT_ACCENT_COLOR) {
  document.documentElement.dataset.accent = accentColor
}
