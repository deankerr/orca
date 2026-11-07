import { cn } from 'cn'
import type { ReactNode } from 'react'

import { useSnapshot } from '#endpoints/hooks'
import { formatScanTime } from '#lib/format'

import { FLUSH_BOTTOM_MEDIA_CLASS } from './panel-layout'
import { ThemeMenu } from './theme-menu'

/** The status bar's frame, with the scan time left to the caller so the loading skeleton can stand in for it. */
export function StatusBarFrame({ scanTime }: { scanTime: ReactNode }) {
  return (
    <footer
      className={cn(
        'flex h-7 shrink-0 items-center justify-between gap-3 border-t border-border px-(--results-inset) font-mono text-[11px] leading-4 text-muted-foreground',
        FLUSH_BOTTOM_MEDIA_CLASS,
      )}
    >
      {/* The units give way to the scan time, which is the one fact here nothing else shows. */}
      <span className="min-w-0 truncate" title="Prices $/M tokens · tok/s and latency p50">
        Prices $/M tokens · tok/s and latency p50
      </span>
      <div className="flex shrink-0 items-center gap-2">
        {scanTime}
        <ThemeMenu />
      </div>
    </footer>
  )
}

export function StatusBar() {
  const { scanAt } = useSnapshot()

  return <StatusBarFrame scanTime={<span>{formatScanTime(scanAt)}</span>} />
}
