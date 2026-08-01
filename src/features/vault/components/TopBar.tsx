import { ChevronRight, Search } from "lucide-react"

import { Input } from "@/components/ui/input"

type TopBarProps = {
  breadcrumbs: string[]
  query: string
  onQueryChange: (query: string) => void
}

export function TopBar({ breadcrumbs, query, onQueryChange }: TopBarProps) {
  return (
    <header className="top-bar">
      <div className="breadcrumbs" aria-label="当前位置">
        {breadcrumbs.map((item, index) => (
          <span className="breadcrumb-part" key={`${item}-${index}`}>
            {index > 0 ? <ChevronRight aria-hidden="true" /> : null}
            {index === breadcrumbs.length - 1 ? <strong>{item}</strong> : <span>{item}</span>}
          </span>
        ))}
      </div>
      <div className="top-actions">
        <div className="search-control">
          <Search aria-hidden="true" />
          <Input
            id="global-search"
            aria-label="全局搜索"
            placeholder="搜索网站、账号、用户名或邮箱"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
          <kbd>Ctrl K</kbd>
        </div>
      </div>
    </header>
  )
}
