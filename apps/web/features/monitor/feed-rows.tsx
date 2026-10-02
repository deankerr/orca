'use client'

import type { EntityAlert } from '@orca/backend/convex/v4/alerts/curate'
import { formatDistanceToNow } from 'date-fns'

import { EntityEventCard } from './event-renderers'

type MonitorFeedRow =
  | { kind: 'header'; key: string; observedAt: string }
  | { kind: 'event'; key: string; event: EntityAlert }

export function flattenMonitorFeed(events: EntityAlert[]): MonitorFeedRow[] {
  const rows: MonitorFeedRow[] = []
  let previousTime: string | undefined

  for (const event of events) {
    if (event.observed_at !== previousTime) {
      rows.push({ kind: 'header', key: `time:${event.observed_at}`, observedAt: event.observed_at })
      previousTime = event.observed_at
    }

    rows.push({
      kind: 'event',
      key: `event:${event.observed_at}:${event.entity_kind}:${event.entity_id}`,
      event,
    })
  }

  return rows
}

export function MonitorFeedRowItem({
  row,
  onEndpointSelect,
}: {
  row: MonitorFeedRow
  onEndpointSelect: (id: string) => void
}) {
  if (row.kind === 'header') {
    const date = new Date(row.observedAt)

    return (
      <div className="mx-auto w-full max-w-xl px-3 pt-6">
        <div className="mb-5 flex items-center gap-3">
          <time
            dateTime={row.observedAt}
            className="font-mono text-xs text-muted-foreground"
            title={row.observedAt}
          >
            {date.toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })}
          </time>
          <span className="text-xs text-muted-foreground/50">
            {formatDistanceToNow(date, { addSuffix: true })}
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-xl px-3 pb-3">
      <EntityEventCard event={row.event} onEndpointSelect={onEndpointSelect} />
    </div>
  )
}
