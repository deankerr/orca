import { useSnapshot } from '#endpoints/hooks'
import { formatScanTime } from '#lib/format'

import { ThemeMenu } from './theme-menu'

export function StatusBar() {
  const { scanAt } = useSnapshot()

  return (
    <footer className="flex h-7 shrink-0 items-center justify-between border-t border-border px-5 font-mono text-[11px] leading-4 text-muted-foreground">
      <span>Prices $/M tokens · tok/s and latency p50</span>
      <div className="flex items-center gap-2">
        <span>{formatScanTime(scanAt)}</span>
        <ThemeMenu />
      </div>
    </footer>
  )
}
