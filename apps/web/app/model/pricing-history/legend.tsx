'use client'

import { formatPricing } from '@orca/backend/shared/formatters'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

import { pricingMetricMetadata } from '../pricing-fields'
import type { PricingMetric } from '../types'
import { hasMetricHistory, priceAt } from './series'
import type { PricingSeries } from './series'

export type LegendEntry = {
  series: PricingSeries
  color: string
}

/**
 * The standings board under the chart: one row per endpoint that has ever been
 * priced, with its price at the instant the chart is scrubbed to. A grid (not
 * flex-wrap) so names and prices form real columns at every width.
 */
export function PricingHistoryLegend({
  at,
  disabledEndpointUuids,
  entries,
  hoveredProviderId,
  metric,
  onEmphasisChange,
  onToggleEndpoint,
}: {
  /** The instant prices are read at: the scrubbed date, or the latest crawl. */
  at: number
  disabledEndpointUuids: ReadonlySet<string>
  /** Undefined while the pricing history is loading. */
  entries: readonly LegendEntry[] | undefined
  hoveredProviderId: string | null
  metric: PricingMetric
  onEmphasisChange: (series: PricingSeries, emphasized: boolean) => void
  onToggleEndpoint: (endpointUuid: string) => void
}) {
  // Widest price the scrubber can ever show for this metric. Reserving it up
  // front keeps rows from reflowing as prices appear and disappear.
  const priceColumnCh = Math.max(
    1,
    ...(entries ?? []).flatMap(({ series }) =>
      series.points.map((point) => {
        const price = point.available ? point.pricing[metric] : undefined
        return price === undefined ? 0 : (formatPricing(metric, price)?.value.length ?? 0)
      }),
    ),
  )

  return (
    <ul
      aria-label="Endpoints"
      className="grid min-h-7 grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-x-3"
    >
      {entries === undefined
        ? ['w-24', 'w-32', 'w-20'].map((width) => (
            <li className="flex h-7 items-center px-1.5" key={width}>
              <Skeleton className={cn('h-3', width)} />
            </li>
          ))
        : entries.map((entry) => (
            <LegendRow
              at={at}
              entry={entry}
              hidden={disabledEndpointUuids.has(entry.series.endpointUuid)}
              hovered={hoveredProviderId === entry.series.provider.tag_slug}
              key={entry.series.endpointUuid}
              metric={metric}
              onEmphasisChange={onEmphasisChange}
              onToggleEndpoint={onToggleEndpoint}
              priceColumnCh={priceColumnCh}
            />
          ))}
    </ul>
  )
}

function LegendRow({
  at,
  entry: { color, series },
  hidden,
  hovered,
  metric,
  onEmphasisChange,
  onToggleEndpoint,
  priceColumnCh,
}: {
  at: number
  entry: LegendEntry
  hidden: boolean
  hovered: boolean
  metric: PricingMetric
  onEmphasisChange: (series: PricingSeries, emphasized: boolean) => void
  onToggleEndpoint: (endpointUuid: string) => void
  priceColumnCh: number
}) {
  const providerId = series.provider.tag_slug
  // Endpoints priced under other metrics keep a disabled slot under every
  // metric, so switching metrics never reflows the board.
  const chartable = hasMetricHistory(series, metric)
  const price = chartable ? priceAt(series, metric, at) : undefined
  const priceLabel = price === undefined ? '–' : (formatPricing(metric, price)?.value ?? '–')

  return (
    <li className="min-w-0">
      <button
        aria-label={
          chartable
            ? `${hidden ? 'Show' : 'Hide'} ${providerId} endpoint`
            : `${providerId} has no ${pricingMetricMetadata(metric).label} pricing`
        }
        aria-pressed={chartable ? !hidden : undefined}
        className={cn(
          'flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-muted-foreground transition-[background-color,color,opacity,scale] outline-none',
          chartable &&
            'hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/30 active:scale-[0.96]',
          chartable && hidden && 'opacity-40',
          !chartable && 'opacity-25',
          // Mirrors hover in the opposite direction: pointing at a chart line
          // lights up the matching row.
          chartable && !hidden && hovered && 'bg-muted/60 text-foreground',
        )}
        disabled={!chartable}
        onClick={() => {
          onToggleEndpoint(series.endpointUuid)
        }}
        onBlur={() => {
          onEmphasisChange(series, false)
        }}
        onFocus={() => {
          onEmphasisChange(series, true)
        }}
        onPointerEnter={() => {
          onEmphasisChange(series, true)
        }}
        onPointerLeave={() => {
          onEmphasisChange(series, false)
        }}
        type="button"
      >
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span
          className="min-w-0 flex-1 truncate text-left"
          title={
            chartable
              ? providerId
              : `${providerId} - no ${pricingMetricMetadata(metric).label} pricing observed`
          }
        >
          {providerId}
        </span>
        <span
          className={cn(
            'shrink-0 text-xs tabular-nums opacity-75',
            // Prices right-align into a column; the placeholder dash reads
            // best centred in the slot.
            price === undefined ? 'text-center' : 'text-right',
          )}
          style={{ minWidth: `${priceColumnCh}ch` }}
        >
          {priceLabel}
        </span>
      </button>
    </li>
  )
}
