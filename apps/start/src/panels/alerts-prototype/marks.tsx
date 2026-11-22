// PROTOTYPE, throwaway (issue #260). Variant D's pieces the Table reads; apart from `variants.tsx`,
// which imports the Table.
import { cn } from 'cn'
import { useMemo } from 'react'

import { useSnapshot } from '#endpoints/hooks'
import type { EndpointRow } from '#endpoints/snapshot'

import { scanLabel, useAlertsMaybe } from './data'

/** A row's mark in the Model cell: how long ago its latest Alert was, toned by what it was. */
export function ChangeMark({ id }: { id: string }) {
  const state = useAlertsMaybe()
  const items = state?.marks === true ? state.byEndpoint.get(id) : undefined
  const latest = items?.[0]
  const { at: now } = useSnapshot()

  if (items === undefined || latest === undefined) {
    return null
  }

  const movement = latest.lines.find((line) => line.movement !== null)?.movement ?? null
  const good = latest.tone === 'added' || movement?.isFavorable === true
  const bad = latest.tone === 'removed' || movement?.isFavorable === false

  return (
    <span
      className={cn(
        'shrink-0 rounded-[3px] px-1 font-mono text-[10px] leading-4',
        good && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
        bad && 'bg-destructive/10 text-destructive',
        !good && !bad && 'bg-muted text-muted-foreground',
      )}
      title={items
        .map(
          (item) =>
            `${scanLabel(item.at, now).clock} ${item.label}: ${item.lines.map((line) => `${line.label} ${line.text}`).join(', ')}`,
        )
        .join('\n')}
    >
      Δ {scanLabel(latest.at, now).ago.replace(' ago', '').replace('latest scan', 'now')}
      {items.length > 1 && ` ×${items.length}`}
    </span>
  )
}

/** With variant D's toggle on, only the rows that have Alerts, newest change first. */
export function useChangedRows(rows: EndpointRow[]): EndpointRow[] {
  const state = useAlertsMaybe()
  const changedOnly = state?.changedOnly === true
  const byEndpoint = state?.byEndpoint

  return useMemo(() => {
    if (!changedOnly || byEndpoint === undefined) {
      return rows
    }

    const latest = (row: EndpointRow) => byEndpoint.get(row.id)?.[0]?.at ?? ''

    return rows
      .filter((row) => byEndpoint.has(row.id))
      .toSorted((left, right) => latest(right).localeCompare(latest(left)))
  }, [byEndpoint, changedOnly, rows])
}
