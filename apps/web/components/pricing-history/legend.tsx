'use client'

import { formatPricing } from '@orca/backend/shared/formatters'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

import { pricingMetricMetadata } from './pricing-fields'
import { hasProviderMetricHistory, providerPriceAt } from './series'
import type { ProviderPricingSeries } from './series'
import type { PricingMetric } from './types'

export type LegendEntry = {
  provider: ProviderPricingSeries
  color: string
}

/**
 * The standings board under the chart: one row per provider that has ever been
 * priced, with its price at the instant the chart is scrubbed to. A grid (not
 * flex-wrap) so names and prices form real columns at every width.
 */
export function PricingHistoryLegend({
  at,
  selectedProviderIds,
  entries,
  hoveredProviderId,
  metric,
  onEmphasisChange,
  onToggleProvider,
}: {
  /** The instant prices are read at: the scrubbed date, or the latest crawl. */
  at: number
  selectedProviderIds: ReadonlySet<string>
  /** Undefined while the pricing history is loading. */
  entries: readonly LegendEntry[] | undefined
  hoveredProviderId: string | null
  metric: PricingMetric
  onEmphasisChange: (providerId: string, emphasized: boolean) => void
  onToggleProvider: (providerId: string) => void
}) {
  // Widest price the scrubber can ever show for this metric. Reserving it up
  // front keeps rows from reflowing as prices appear and disappear.
  const priceColumnCh = Math.max(
    1,
    ...(entries ?? []).flatMap(({ provider }) =>
      provider.series.flatMap((series) =>
        series.points.map((point) => {
          const price = point.available ? point.pricing[metric] : undefined
          return price === undefined ? 0 : (formatPricing(metric, price)?.value.length ?? 0)
        }),
      ),
    ),
  )

  return (
    <ul
      aria-label="Providers"
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
              hidden={!selectedProviderIds.has(entry.provider.providerId)}
              hovered={hoveredProviderId === entry.provider.providerId}
              key={entry.provider.providerId}
              metric={metric}
              onEmphasisChange={onEmphasisChange}
              onToggleProvider={onToggleProvider}
              priceColumnCh={priceColumnCh}
            />
          ))}
    </ul>
  )
}

function LegendRow({
  at,
  entry: { color, provider },
  hidden,
  hovered,
  metric,
  onEmphasisChange,
  onToggleProvider,
  priceColumnCh,
}: {
  at: number
  entry: LegendEntry
  hidden: boolean
  hovered: boolean
  metric: PricingMetric
  onEmphasisChange: (providerId: string, emphasized: boolean) => void
  onToggleProvider: (providerId: string) => void
  priceColumnCh: number
}) {
  const { providerId } = provider
  // Providers priced under other metrics keep a disabled slot under every
  // metric, so switching metrics never reflows the board.
  const chartable = hasProviderMetricHistory(provider, metric)
  const price = chartable ? providerPriceAt(provider, metric, at) : undefined
  const priceLabel = price === undefined ? '–' : (formatPricing(metric, price)?.value ?? '–')

  return (
    <li className="min-w-0">
      <button
        aria-label={
          chartable
            ? `${hidden ? 'Show' : 'Hide'} ${providerId} provider`
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
          onToggleProvider(providerId)
        }}
        onBlur={() => {
          onEmphasisChange(providerId, false)
        }}
        onFocus={() => {
          onEmphasisChange(providerId, true)
        }}
        onPointerEnter={() => {
          onEmphasisChange(providerId, true)
        }}
        onPointerLeave={() => {
          onEmphasisChange(providerId, false)
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
          className="shrink-0 text-right text-xs tabular-nums"
          style={{ minWidth: `${priceColumnCh}ch` }}
        >
          {priceLabel}
        </span>
      </button>
    </li>
  )
}
