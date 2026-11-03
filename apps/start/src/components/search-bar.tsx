import { Search } from 'lucide-react'

export function SearchBar() {
  return (
    <div className="shrink-0 px-3 pb-2.5">
      <label className="flex h-8 items-center gap-2 rounded-md border border-input bg-background px-2.5 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
        <Search aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          aria-label="Search models, providers"
          className="min-w-0 grow bg-transparent text-[13px] leading-4 outline-none placeholder:text-muted-foreground"
          placeholder="Search models, providers"
          type="search"
        />
        <kbd className="rounded-sm border border-border px-1 py-px font-mono text-[10px] leading-3 text-muted-foreground">
          ⌘K
        </kbd>
      </label>
    </div>
  )
}
