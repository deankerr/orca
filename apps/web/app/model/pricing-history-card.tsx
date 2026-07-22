'use client'

import { api } from '@orca/backend/convex/_generated/api'
import { formatPricing, PRICING_FIELD_KEYS } from '@orca/backend/shared/formatters'
import dynamic from 'next/dynamic'
import { parseAsStringLiteral, useQueryState } from 'nuqs'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useCachedQuery } from '@/hooks/use-cached-query'
import { cn } from '@/lib/utils'

import { ModelPageCard } from './model-page-card'
import { isPricingMetric, PRICING_METRICS, pricingMetricMetadata } from './pricing-fields'
import { hasMetricHistory, priceAt } from './pricing-history-chart-option'
import type { PricingSeries } from './pricing-history-chart-option'
import { endpointColor } from './pricing-history-colors'
import type { PricingHistoryPlotHandle } from './pricing-history-plot'

// ECharts is browser-only and relatively heavy. The card renders the complete
// shell (toggles, footer, legend) itself, so this deferred chunk only ever
// paints pixels inside an already-reserved box - loading it can't shift layout.
const PricingHistoryPlot = dynamic(
  async () => {
    const plotModule = await import('./pricing-history-plot')
    return plotModule.PricingHistoryPlot
  },
  {
    ssr: false,
    loading: () => (
      <output className="flex h-full items-center justify-center text-muted-foreground">
        <Spinner />
        <span className="sr-only">Loading chart</span>
      </output>
    ),
  },
)

// The metric lives in the URL so a specific chart view is directly linkable,
// matching the page's ?tab= parameter.
const metricParser = parseAsStringLiteral(PRICING_FIELD_KEYS).withDefault('text_input')

export function PricingHistoryCard({ modelSlug }: { modelSlug: string }) {
  const [requestedMetric, setRequestedMetric] = useQueryState('metric', metricParser)
  const [disabledEndpointUuids, setDisabledEndpointUuids] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const [isZoomed, setIsZoomed] = useState(false)
  const [hoveredProviderId, setHoveredProviderId] = useState<string | null>(null)
  // The date the chart's axis pointer is on, while the user scrubs the chart.
  // The legend doubles as the standings board for this instant.
  const [scrubTimestamp, setScrubTimestamp] = useState<number | null>(null)
  const plotRef = useRef<PricingHistoryPlotHandle | null>(null)
  // Fetch the complete retained history once. The navigator changes only the
  // client viewport, so exploring a different period never changes page height
  // or starts another backend subscription.
  const history = useCachedQuery(api.endpointPricingHistory.get, { modelSlug })

  const availableMetrics =
    history === undefined
      ? []
      : PRICING_METRICS.filter((candidate) =>
          history.series.some((series) => hasMetricHistory(series, candidate.key)),
        )
  const displayedMetrics = PRICING_METRICS.filter(
    (candidate) =>
      candidate.alwaysCompare || availableMetrics.some(({ key }) => key === candidate.key),
  )
  // A model may never have had input pricing. Prefer the user's last explicit
  // choice when it exists, otherwise select the first price observed in history.
  const metric = availableMetrics.some(({ key }) => key === requestedMetric)
    ? requestedMetric
    : (availableMetrics[0]?.key ?? requestedMetric)
  const hasPricingHistory = availableMetrics.length > 0

  // Legend entries and colors derive from the full series list - the same
  // source the chart reads - so hiding an endpoint or loading the chunk can
  // never change the identity of what is already on screen. Endpoints priced
  // under any metric keep a (possibly disabled) slot under every metric, so
  // switching metrics never reflows the legend or shifts the page height.
  const legendSeries =
    history === undefined
      ? []
      : history.series
          .map((series, colorIndex) => ({ series, colorIndex }))
          .filter(({ series }) => availableMetrics.some(({ key }) => hasMetricHistory(series, key)))
  const renderableSeries = legendSeries.filter(({ series }) => hasMetricHistory(series, metric))
  const visibleSeries = renderableSeries.filter(
    ({ series }) => !disabledEndpointUuids.has(series.endpointUuid),
  )
  // Widest price the scrubber can ever show for this metric. Reserving it up
  // front keeps chips from reflowing as prices appear and disappear.
  const priceColumnCh = Math.max(
    1,
    ...legendSeries.flatMap(({ series }) =>
      series.points.map((point) => {
        const price = point.available ? point.pricing[metric] : undefined
        return price === undefined ? 0 : (formatPricing(metric, price)?.value.length ?? 0)
      }),
    ),
  )

  const handleMetricChange = (values: string[]) => {
    const [nextMetric] = values
    if (nextMetric !== undefined && isPricingMetric(nextMetric)) {
      void setRequestedMetric(nextMetric)
    }
  }

  const toggleEndpoint = (endpointUuid: string) => {
    setDisabledEndpointUuids((current) => {
      const next = new Set(current)
      if (next.has(endpointUuid)) {
        next.delete(endpointUuid)
      } else {
        next.add(endpointUuid)
      }
      return next
    })
  }

  const toggleAllEndpoints = () => {
    if (visibleSeries.length === renderableSeries.length) {
      setDisabledEndpointUuids(
        (current) =>
          new Set([...current, ...renderableSeries.map(({ series }) => series.endpointUuid)]),
      )
      return
    }

    setDisabledEndpointUuids(new Set())
  }

  const setEndpointEmphasis = (series: PricingSeries, emphasized: boolean) => {
    if (disabledEndpointUuids.has(series.endpointUuid)) {
      return
    }

    plotRef.current?.setSeriesEmphasis(series.provider.tag_slug, emphasized)
  }

  return (
    <ModelPageCard title="Pricing History">
      <CardContent className="flex flex-col gap-4 px-2">
        <ToggleGroup
          aria-label="Pricing metric"
          className="min-h-7 shadow-sm"
          multiple={false}
          onValueChange={handleMetricChange}
          size="default"
          value={hasPricingHistory ? [metric] : []}
          variant="outline"
        >
          {displayedMetrics.map((candidate) => (
            <ToggleGroupItem
              className="min-w-20 px-4 active:scale-[0.96]"
              disabled={!availableMetrics.some(({ key }) => key === candidate.key)}
              key={candidate.key}
              value={candidate.key}
            >
              {candidate.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <div aria-busy={history === undefined} className="flex flex-col gap-3">
          <div className="relative h-[390px] w-full overflow-hidden rounded-md bg-muted/15">
            {history === undefined ? (
              <output className="flex h-full items-center justify-center text-muted-foreground">
                <Spinner />
                <span className="sr-only">Loading pricing history</span>
              </output>
            ) : hasPricingHistory ? (
              <>
                <div
                  className={cn(
                    'h-full w-full transition-opacity duration-150',
                    visibleSeries.length === 0 && 'pointer-events-none opacity-0',
                  )}
                >
                  <PricingHistoryPlot
                    disabledEndpointUuids={disabledEndpointUuids}
                    handleRef={plotRef}
                    history={history}
                    metric={metric}
                    onAxisHoverChange={setScrubTimestamp}
                    onSeriesHoverChange={setHoveredProviderId}
                    onZoomedChange={setIsZoomed}
                  />
                </div>
                {visibleSeries.length === 0 ? (
                  <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-muted-foreground">
                    Select an endpoint below to render its pricing history.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="flex h-full items-center justify-center px-6 text-center text-muted-foreground">
                No pricing was observed.
              </p>
            )}
          </div>

          <div className="flex min-h-10 items-center justify-between gap-3">
            {history === undefined ? (
              <Skeleton className="h-3 w-40" />
            ) : (
              <p aria-live="polite" className="text-muted-foreground tabular-nums">
                {visibleSeries.length} of {renderableSeries.length} endpoints shown
              </p>
            )}
            <div className="flex items-center gap-1">
              <Button
                className="active:scale-[0.96]"
                disabled={!isZoomed}
                onClick={() => plotRef.current?.resetZoom()}
                variant="ghost"
              >
                Reset zoom
              </Button>
              <Button
                className="active:scale-[0.96]"
                disabled={renderableSeries.length === 0}
                onClick={toggleAllEndpoints}
                variant="ghost"
              >
                {visibleSeries.length === renderableSeries.length ? 'Hide all' : 'Show all'}
              </Button>
            </div>
          </div>

          <ul className="flex min-h-7 flex-wrap gap-x-2.5" aria-label="Endpoints">
            {history === undefined
              ? ['w-24', 'w-32', 'w-20'].map((width) => (
                  <li className="flex h-7 items-center px-1.5" key={width}>
                    <Skeleton className={cn('h-3', width)} />
                  </li>
                ))
              : legendSeries.map(({ series, colorIndex }) => {
                  const providerId = series.provider.tag_slug
                  const chartable = hasMetricHistory(series, metric)
                  const hidden = disabledEndpointUuids.has(series.endpointUuid)
                  // Standing price at the scrubbed instant, or the latest
                  // observation when the pointer is off the chart.
                  const price = chartable
                    ? priceAt(series, metric, scrubTimestamp ?? history.asOf)
                    : undefined
                  const priceLabel =
                    price === undefined ? '–' : (formatPricing(metric, price)?.value ?? '–')

                  return (
                    <li className="min-w-0" key={series.endpointUuid}>
                      <button
                        aria-label={
                          chartable
                            ? `${hidden ? 'Show' : 'Hide'} ${providerId} endpoint`
                            : `${providerId} has no ${pricingMetricMetadata(metric).label} pricing`
                        }
                        aria-pressed={chartable ? !hidden : undefined}
                        className={cn(
                          'flex min-w-40 items-center gap-1.5 rounded-md px-1.5 py-1 text-muted-foreground transition-[background-color,color,opacity,scale] outline-none',
                          chartable &&
                            'hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/30 active:scale-[0.96]',
                          chartable && hidden && 'opacity-40',
                          !chartable && 'opacity-25',
                          // Mirrors hover in the opposite direction: pointing at a
                          // chart line lights up the matching legend chip.
                          chartable &&
                            !hidden &&
                            hoveredProviderId === providerId &&
                            'bg-muted/60 text-foreground',
                        )}
                        disabled={!chartable}
                        onClick={() => {
                          toggleEndpoint(series.endpointUuid)
                        }}
                        onBlur={() => {
                          setEndpointEmphasis(series, false)
                        }}
                        onFocus={() => {
                          setEndpointEmphasis(series, true)
                        }}
                        onPointerEnter={() => {
                          setEndpointEmphasis(series, true)
                        }}
                        onPointerLeave={() => {
                          setEndpointEmphasis(series, false)
                        }}
                        type="button"
                      >
                        <span
                          aria-hidden
                          className="size-2 shrink-0 rounded-full"
                          style={{
                            backgroundColor: endpointColor(colorIndex, history.series.length),
                          }}
                        />
                        <span
                          className="max-w-52 truncate"
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
                            'ml-auto shrink-0 text-xs tabular-nums opacity-75',
                            // Left-aligned prices hug their provider name; the
                            // reserved slack trails invisibly after them. The
                            // placeholder dash reads best centred in the slot.
                            price === undefined ? 'text-center' : 'text-right',
                          )}
                          style={{ minWidth: `${priceColumnCh}ch` }}
                        >
                          {priceLabel}
                        </span>
                      </button>
                    </li>
                  )
                })}
          </ul>
        </div>
      </CardContent>
    </ModelPageCard>
  )
}
