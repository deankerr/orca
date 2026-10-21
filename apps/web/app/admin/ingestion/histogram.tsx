'use client'

import { api } from '@orca/backend/api'
import { useQuery } from 'convex/react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

import { count, scanTime, STATE_COLORS, STATES } from './format'

const HOUR = 3_600_000

/**
 * Bucket sizes aligned to UTC, smallest first. Captures are hourly, so an hour is the finest
 * useful bucket: an empty hourly bucket is a missing capture rather than a sampling artefact.
 */
const SIZES = [
  { ms: HOUR, label: '1 hour' },
  { ms: 2 * HOUR, label: '2 hours' },
  { ms: 6 * HOUR, label: '6 hours' },
  { ms: 12 * HOUR, label: '12 hours' },
  { ms: 24 * HOUR, label: '1 day' },
  { ms: 2 * 24 * HOUR, label: '2 days' },
  { ms: 7 * 24 * HOUR, label: '7 days' },
  { ms: 14 * 24 * HOUR, label: '14 days' },
  { ms: 28 * 24 * HOUR, label: '28 days' },
] as const

/** Enough bars to read, few enough to stay wide. */
const MAX_BUCKETS = 180

/** The smallest aligned bucket size that covers the range in at most `MAX_BUCKETS` bars. */
function bucketing({ start_at, end_at }: Range) {
  const start = Date.parse(start_at)
  const end = Date.parse(end_at)
  const size = SIZES.find(({ ms }) => Math.ceil((end - start) / ms) <= MAX_BUCKETS)
  // Beyond the largest size, widen whole days so the bar count stays within the server limit.
  const day = 24 * HOUR
  const ms = size?.ms ?? Math.ceil((end - start) / MAX_BUCKETS / day) * day
  const alignedStart = Math.floor(start / ms) * ms
  // An aligned end exactly on a boundary would add an empty bucket for that instant alone.
  const alignedEnd = Math.max(alignedStart + ms, Math.ceil((end + 1) / ms) * ms)

  return {
    label: size?.label ?? `${ms / day} days`,
    ms,
    start_at: new Date(alignedStart).toISOString(),
    end_at: new Date(alignedEnd).toISOString(),
    buckets: (alignedEnd - alignedStart) / ms,
  }
}

type Range = { start_at: string; end_at: string }

/**
 * Pair states over time, as exact per-bucket counts. Cost follows the bucket count, so the
 * same view serves a day or several years; clicking a bucket zooms into it.
 */
export function Histogram({ range }: { range: Range }) {
  const [zoom, setZoom] = useState<Range[]>([])
  const [hovered, setHovered] = useState<number | null>(null)
  const view = bucketing(zoom.at(-1) ?? range)
  const data = useQuery(api.ingestion.admin.histogram, {
    start_at: view.start_at,
    end_at: view.end_at,
    buckets: view.buckets,
  })

  if (data === undefined) {
    return <Skeleton className="h-36 w-full" />
  }

  const totals = data.edges
    .slice(0, -1)
    .map((_, bucket) => STATES.reduce((sum, state) => sum + (data.counts[state]?.[bucket] ?? 0), 0))
  const max = Math.max(1, ...totals)
  const detail = hovered ?? null

  return (
    <div className="flex flex-col gap-1.5">
      {/* Each bucket is a button: hovering reads its counts, clicking zooms into it. */}
      <div
        className="flex h-24 w-full items-end gap-px"
        onMouseLeave={() => {
          setHovered(null)
        }}
      >
        {totals.map((total, bucket) => {
          const lower = data.edges[bucket] ?? ''
          const upper = data.edges[bucket + 1] ?? ''
          const zoomable = total > 0 && view.ms > HOUR

          return (
            <button
              key={lower}
              type="button"
              aria-label={`${scanTime(lower)} to ${scanTime(upper)}: ${count.format(total)} pairs`}
              className={cn(
                'flex h-full min-w-0 flex-1 flex-col-reverse',
                zoomable ? 'cursor-zoom-in' : 'cursor-default',
                hovered === bucket ? 'opacity-100' : 'opacity-85',
              )}
              onMouseEnter={() => {
                setHovered(bucket)
              }}
              onFocus={() => {
                setHovered(bucket)
              }}
              onClick={() => {
                if (zoomable) {
                  setZoom([...zoom, { start_at: lower, end_at: upper }])
                }
              }}
            >
              {STATES.map((state) => {
                const value = data.counts[state]?.[bucket] ?? 0
                return value === 0 ? null : (
                  <span
                    key={state}
                    className="w-full"
                    style={{ height: `${(value / max) * 100}%`, background: STATE_COLORS[state] }}
                  />
                )
              })}
            </button>
          )
        })}
      </div>
      <div className="flex items-center justify-between gap-2 font-mono text-[0.625rem] text-muted-foreground">
        <span>{scanTime(view.start_at)}</span>
        <span className="truncate">
          {detail === null
            ? `1 bar = ${view.label} · max ${count.format(max)}${view.ms > HOUR ? ' · click to zoom' : ''}`
            : `${scanTime(data.edges[detail] ?? null)} → ${scanTime(data.edges[detail + 1] ?? null)} · ${STATES.map(
                (state) => `${state} ${count.format(data.counts[state]?.[detail] ?? 0)}`,
              ).join(' · ')}`}
        </span>
        <span>{scanTime(view.end_at)}</span>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {STATES.map((state) => (
          <span key={state} className="flex items-center gap-1">
            <span className="size-2 rounded-xs" style={{ background: STATE_COLORS[state] }} />
            {state}
          </span>
        ))}
        {zoom.length > 0 && (
          <span className="ml-auto flex gap-1">
            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                setZoom(zoom.slice(0, -1))
              }}
            >
              Zoom out
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                setZoom([])
              }}
            >
              Full range
            </Button>
          </span>
        )}
      </div>
    </div>
  )
}
