'use client'

import { api } from '@orca/backend/convex/_generated/api'
import { PRICING_FIELD_KEYS } from '@orca/backend/shared/formatters'
import { format } from 'date-fns'
import ms from 'ms'
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

import { ModelPageCard } from '../model-page-card'
import { isPricingMetric, PRICING_METRICS } from '../pricing-fields'
import { FULL_HISTORY_WINDOW, zoomWindowsEqual } from './chart-option'
import type { ZoomWindow } from './chart-option'
import { endpointColor } from './colors'
import { PricingHistoryLegend } from './legend'
import type { PricingHistoryPlotHandle } from './plot'
import { hasMetricHistory } from './series'
import type { PricingSeries } from './series'

// ECharts is browser-only and relatively heavy. The card renders the complete
// shell (toggles, footer, legend) itself, so this deferred chunk only ever
// paints pixels inside an already-reserved box - loading it can't shift layout.
const PricingHistoryPlot = dynamic(
  async () => {
    const plotModule = await import('./plot')
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

// Quick zoom presets for the most recent period. A preset covering the whole
// retained history is disabled - it communicates how much history exists.
const ZOOM_PRESETS = [
  { label: '1m', duration: ms('30d') },
  { label: '3m', duration: ms('90d') },
  { label: '6m', duration: ms('180d') },
]

export function PricingHistoryCard({ modelSlug }: { modelSlug: string }) {
  const [requestedMetric, setRequestedMetric] = useQueryState('metric', metricParser)
  const [disabledEndpointUuids, setDisabledEndpointUuids] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const [zoomWindow, setZoomWindow] = useState<ZoomWindow>(FULL_HISTORY_WINDOW)
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
  const historySpan = history === undefined ? 0 : history.asOf - history.since

  // Legend entries and colors derive from the full series list - the same
  // source the chart reads - so hiding an endpoint or loading the chunk can
  // never change the identity of what is already on screen.
  const legendEntries =
    history === undefined
      ? undefined
      : history.series
          .map((series, colorIndex) => ({
            series,
            color: endpointColor(colorIndex, history.series.length),
          }))
          .filter(({ series }) => availableMetrics.some(({ key }) => hasMetricHistory(series, key)))
  const renderableSeries = (legendEntries ?? []).filter(({ series }) =>
    hasMetricHistory(series, metric),
  )
  const visibleSeries = renderableSeries.filter(
    ({ series }) => !disabledEndpointUuids.has(series.endpointUuid),
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

  // A preset is a window covering the most recent duration. "All" is the only
  // range key that isn't a preset - it maps to the full history window.
  const presetWindow = (duration: number): ZoomWindow => ({
    start: Math.max(0, 100 - (duration / historySpan) * 100),
    end: 100,
  })
  const activeRangeKey = (() => {
    if (!hasPricingHistory) {
      return undefined
    }

    if (zoomWindowsEqual(zoomWindow, FULL_HISTORY_WINDOW)) {
      return 'all'
    }

    return ZOOM_PRESETS.find(
      (preset) =>
        historySpan > preset.duration &&
        zoomWindowsEqual(zoomWindow, presetWindow(preset.duration)),
    )?.label
  })()

  const handleRangeChange = (values: string[]) => {
    const [key] = values
    if (key === undefined || historySpan <= 0) {
      return
    }

    const preset = ZOOM_PRESETS.find(({ label }) => label === key)
    plotRef.current?.zoomTo(
      preset === undefined ? FULL_HISTORY_WINDOW : presetWindow(preset.duration),
    )
  }

  const setEndpointEmphasis = (series: PricingSeries, emphasized: boolean) => {
    if (disabledEndpointUuids.has(series.endpointUuid)) {
      return
    }

    plotRef.current?.setSeriesEmphasis(series.provider.tag_slug, emphasized)
  }

  return (
    <ModelPageCard title="Pricing History">
      <CardContent className="flex flex-col gap-3">
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

        <div aria-busy={history === undefined} className="relative -mx-4 h-[390px] overflow-hidden">
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
                  onZoomWindowChange={setZoomWindow}
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
              No pricing data found.
            </p>
          )}
        </div>

        <div aria-busy={history === undefined} className="flex flex-col gap-3">
          {/* Time row: everything about the visible window, docked to the slider. */}
          <div className="flex min-h-8 items-center justify-between gap-3 text-sm">
            {history === undefined ? (
              <Skeleton className="h-5 w-48" />
            ) : (
              <p className="text-muted-foreground tabular-nums">
                {hasPricingHistory ? visibleRangeLabel(history, zoomWindow) : null}
              </p>
            )}

            <ToggleGroup
              aria-label="Zoom range"
              className="shadow-sm"
              multiple={false}
              onValueChange={handleRangeChange}
              size="default"
              value={activeRangeKey === undefined ? [] : [activeRangeKey]}
              variant="outline"
            >
              {ZOOM_PRESETS.map((preset) => (
                <ToggleGroupItem
                  className="min-w-12 px-3 active:scale-[0.96]"
                  disabled={historySpan <= preset.duration}
                  key={preset.label}
                  value={preset.label}
                >
                  {preset.label}
                </ToggleGroupItem>
              ))}
              <ToggleGroupItem
                className="min-w-12 px-3 active:scale-[0.96]"
                disabled={!hasPricingHistory}
                value="all"
              >
                All
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {/* Legend section: endpoint count and visibility controls live with
              the rows they act on. */}
          <div className="flex flex-col gap-1 border-t pt-2">
            <div className="flex min-h-8 items-center justify-between gap-3">
              {history === undefined ? (
                <Skeleton className="h-3 w-32" />
              ) : (
                <p aria-live="polite" className="text-muted-foreground tabular-nums">
                  {`${visibleSeries.length} of ${renderableSeries.length} endpoints`}
                </p>
              )}
              <Button
                className="active:scale-[0.96]"
                disabled={renderableSeries.length === 0}
                onClick={toggleAllEndpoints}
                variant="ghost"
              >
                {visibleSeries.length === renderableSeries.length ? 'Hide all' : 'Show all'}
              </Button>
            </div>

            <PricingHistoryLegend
              at={scrubTimestamp ?? history?.asOf ?? 0}
              disabledEndpointUuids={disabledEndpointUuids}
              entries={legendEntries}
              hoveredProviderId={hoveredProviderId}
              metric={metric}
              onEmphasisChange={setEndpointEmphasis}
              onToggleEndpoint={toggleEndpoint}
            />
          </div>
        </div>
      </CardContent>
    </ModelPageCard>
  )
}

/** Summary of the visible slice of history, e.g. "Jun 17 – Jul 21, 2026 · 34 days". */
function visibleRangeLabel(bounds: { since: number; asOf: number }, zoom: ZoomWindow) {
  const span = bounds.asOf - bounds.since
  const start = bounds.since + (span * zoom.start) / 100
  const end = bounds.since + (span * zoom.end) / 100
  const sameYear = new Date(start).getFullYear() === new Date(end).getFullYear()
  return `${format(start, sameYear ? 'MMM d' : 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')} · ${durationLabel(end - start)}`
}

/** A freshly listed model has hours of history, not a rounded-up "1 day". */
function durationLabel(duration: number) {
  if (duration < ms('1h')) {
    const minutes = Math.max(1, Math.round(duration / ms('1m')))
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
  }

  if (duration < ms('1d')) {
    const hours = Math.round(duration / ms('1h'))
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
  }

  const days = Math.round(duration / ms('1d'))
  return `${days} ${days === 1 ? 'day' : 'days'}`
}
