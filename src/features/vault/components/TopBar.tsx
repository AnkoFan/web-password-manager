import { Search } from "lucide-react"

import { Input } from "@/components/ui/input"

type TopBarProps = {
  query: string
  onQueryChange: (query: string) => void
  filterCurrentCategory?: boolean
}

export function TopBar({ query, onQueryChange, filterCurrentCategory = false }: TopBarProps) {
  return (
    <header className="top-bar">
      <div className="top-actions">
        <div className="search-control">
          <Search aria-hidden="true" />
          <Input
            id="global-search"
            aria-label={filterCurrentCategory ? "筛选当前分类" : "全局搜索"}
            placeholder={
              filterCurrentCategory
                ? "筛选当前分类的网站、账号、用户名或邮箱"
                : "搜索网站、账号、用户名或邮箱"
            }
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
          <kbd>Ctrl K</kbd>
        </div>
      </div>
    </header>
  )
}
