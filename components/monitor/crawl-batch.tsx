'use client'

import type { EntityChange } from '@/convex/db/or/views/changes'
import type { CrawlBatch } from '@/convex/monitor'
import { groupChanges } from '@/convex/shared/groups'
import { formatRelativeTime } from '@/lib/formatters'
import { cn } from '@/lib/utils'

import { EntityEventCard } from './event-renderers'

type MonitorBatchHeaderRow = {
  kind: 'batch-header'
  key: string
  dateTime: string
  formattedTime: string
  relativeTime: string
}

type MonitorChangeRow = {
  kind: 'change'
  key: string
  change: EntityChange
  topSpacingClassName?: string
}

export type MonitorFeedRow = MonitorBatchHeaderRow | MonitorChangeRow

export function flattenMonitorFeed(batches: CrawlBatch[]): MonitorFeedRow[] {
  const rows: MonitorFeedRow[] = []

  batches.forEach((batch) => {
    if (batch.changes.length === 0) return

    const groups = groupChanges(batch.changes)
    if (groups.length === 0) return

    const timestamp = Number(batch.crawl_id)
    const date = new Date(timestamp)

    rows.push({
      kind: 'batch-header',
      key: `batch:${batch.crawl_id}`,
      dateTime: date.toISOString(),
      formattedTime: date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
      relativeTime: formatRelativeTime(timestamp),
    })

    groups.forEach((group, groupIndex) => {
      group.changes.forEach((change, changeIndex) => {
        rows.push({
          kind: 'change',
          key: `change:${batch.crawl_id}:${groupIndex}:${changeIndex}:${changeKey(change)}`,
          change,
          topSpacingClassName:
            groupIndex === 0 && changeIndex === 0 ? undefined : changeIndex === 0 ? 'mt-4' : 'mt-3',
        })
      })
    })
  })

  return rows
}

export function MonitorFeedRowItem({ row }: { row: MonitorFeedRow }) {
  if (row.kind === 'batch-header') {
    return (
      <div className="mx-auto w-full max-w-xl px-3 pt-6">
        <div className="mb-5 flex items-center gap-3">
          <time
            dateTime={row.dateTime}
            className="font-mono text-xs text-muted-foreground"
            title={row.dateTime}
          >
            {row.formattedTime}
          </time>
          <span className="text-xs text-muted-foreground/50">{row.relativeTime}</span>
          <div className="h-px flex-1 bg-border" />
        </div>
      </div>
    )
  }

  return (
    <div className={cn('mx-auto w-full max-w-xl px-3', row.topSpacingClassName)}>
      <EntityEventCard change={row.change} />
    </div>
  )
}

function changeKey(change: EntityChange): string {
  if (change.event.kind !== 'entity_updated') return change.event.change_id
  const firstField = change.event.fields[0]
  if (firstField) return firstField.change_id
  return `${change.entity_type}:${change.event.kind}`
}
