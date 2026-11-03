import { ChartScatter } from 'lucide-react'

export function ScopeBar() {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between px-5">
      <div className="flex items-baseline gap-2.5">
        <span className="text-sm/5 font-semibold">103 endpoints</span>
        <span className="font-mono text-[11px] leading-4 text-muted-foreground">
          of 1,484 · 29 models · 31 providers
        </span>
      </div>
      <div className="flex items-center gap-3.5 font-mono text-[11px] leading-4">
        <span className="text-muted-foreground">8 filters</span>
        <button className="underline underline-offset-2" type="button">
          clear
        </button>
        <button aria-pressed="true" className="flex items-center gap-1.5" type="button">
          <ChartScatter aria-hidden="true" className="size-3.5 text-muted-foreground" />
          plot
        </button>
      </div>
    </div>
  )
}
