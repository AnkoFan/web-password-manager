import { Globe2, Search, UserRound } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { SearchResult } from "@/services/vault-client"

type SearchResultsProps = {
  query: string
  results: SearchResult[]
  onSelect: (result: SearchResult) => void
}

export function SearchResults({ query, results, onSelect }: SearchResultsProps) {
  return (
    <section className="search-results" aria-label="搜索结果">
      <header>
        <div>
          <p>全局搜索</p>
          <h2>“{query}”的结果</h2>
        </div>
        <Badge variant="secondary">{results.length}</Badge>
      </header>
      <div className="search-result-list">
        {results.map((result) => (
          <button type="button" key={`${result.kind}-${result.id}`} onClick={() => onSelect(result)}>
            <span className="search-result-icon">
              {result.kind === "website" ? (
                <Globe2 aria-hidden="true" />
              ) : (
                <UserRound aria-hidden="true" />
              )}
            </span>
            <span>
              <strong>{result.title}</strong>
              <small>{result.subtitle}</small>
            </span>
            <Badge variant="outline">{result.kind === "website" ? "网站" : "账号"}</Badge>
          </button>
        ))}
        {results.length === 0 ? (
          <div className="search-empty">
            <Search aria-hidden="true" />
            <strong>没有匹配结果</strong>
            <p>搜索不会匹配密码、Token 或其他敏感字段。</p>
          </div>
        ) : null}
      </div>
    </section>
  )
}
