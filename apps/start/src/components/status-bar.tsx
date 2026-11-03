import { useCatalog } from '#features/endpoints/hooks'

import { formatScanTime } from '../features/table/format'

export function StatusBar() {
  const { at } = useCatalog()

  return (
    <footer className="flex h-7 shrink-0 items-center justify-between border-t border-border px-5 font-mono text-[11px] leading-4 text-muted-foreground">
      <span>Prices $/M tokens · tok/s and latency p50</span>
      <span>{formatScanTime(at)}</span>
    </footer>
  )
}
