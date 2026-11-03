import { HeaderBar } from '#components/header-bar'
import { SearchBar } from '#components/search-bar'

const facets = [
  { count: 29, name: 'Model', rows: 3 },
  { count: 31, name: 'Provider', rows: 3 },
  { count: 4, name: 'Price and speed', rows: 4 },
  { count: 2, name: 'Data policy', rows: 2 },
  { count: 1, name: 'Tools', rows: 1 },
]

function FacetPlaceholder({ count, name, rows }: (typeof facets)[number]) {
  return (
    <section className="flex flex-col gap-0.5 border-b border-border px-3 pt-2.5 pb-2">
      <div className="flex h-5 items-center justify-between font-mono text-[10px] leading-3.5 text-muted-foreground">
        <h2 className="font-normal tracking-[0.08em] uppercase">{name}</h2>
        <span>{count}</span>
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div className="flex h-6 items-center gap-2" key={row}>
          <div className="size-3.5 shrink-0 rounded-sm border border-input" />
          <div className="h-2 w-2/3 rounded-sm bg-muted" />
        </div>
      ))}
    </section>
  )
}

export function FiltersPanel() {
  return (
    <aside
      aria-label="Filters"
      className="flex w-68 shrink-0 flex-col overflow-clip rounded-xl border border-border bg-card"
    >
      <HeaderBar />
      <SearchBar />
      <div className="flex min-h-0 grow flex-col overflow-y-auto border-t border-border">
        {facets.map((facet) => (
          <FacetPlaceholder key={facet.name} {...facet} />
        ))}
      </div>
    </aside>
  )
}
