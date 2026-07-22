'use client'

import { api } from '@orca/backend/convex/_generated/api'
import { PRICING_FIELD_KEYS } from '@orca/backend/shared/formatters'
import ms from 'ms'
import dynamic from 'next/dynamic'
import { parseAsArrayOf, parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs'
import { useMemo, useRef, useState } from 'react'

import { EntityIdentity } from '@/components/shared/entity-identity'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useCachedQuery } from '@/hooks/use-cached-query'
import { cn } from '@/lib/utils'

import type { ZoomWindow } from './chart-option'
import { FULL_HISTORY_WINDOW } from './chart-option'
import { endpointColor } from './colors'
import { PricingHistoryLegend } from './legend'
import type { PricingHistoryPlotHandle } from './plot'
import { isPricingMetric, pricingMetricMetadata, PRICING_METRICS } from './pricing-fields'
import { groupSeriesByProvider, hasMetricHistory, hasProviderMetricHistory } from './series'

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
const queryStateOptions = { history: 'push' as const, shallow: true }
const providersParser = parseAsArrayOf(parseAsString).withOptions(queryStateOptions)

// Quick zoom presets for the most recent period. A preset is enabled exactly
// when that many days of history exist - together the disabled states
// communicate how much history there is to explore.
const ZOOM_PRESETS = [
  { label: '1y', duration: ms('365d') },
  { label: '180d', duration: ms('180d') },
  { label: '90d', duration: ms('90d') },
  { label: '30d', duration: ms('30d') },
]

const HISTORY_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

// Most models price 2-4 metrics, where tactile toggles shine. Multi-modal
// outliers (Google prices ~10) collapse into a Select instead of wrapping the
// controls row into a second line of toggles.
const MAX_METRIC_TOGGLES = 4

export function PricingHistoryCard({
  modelName,
  modelSlug,
}: {
  modelName: string
  modelSlug: string
}) {
  const [requestedMetric, setRequestedMetric] = useQueryState('metric', metricParser)
  const [requestedProviderIds, setRequestedProviderIds] = useQueryState(
    'providers',
    providersParser,
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
  const providers = useMemo(() => groupSeriesByProvider(history?.series ?? []), [history?.series])

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
  const providersWithPricing = useMemo(
    () =>
      providers.filter((provider) =>
        PRICING_METRICS.some(({ key }) => hasProviderMetricHistory(provider, key)),
      ),
    [providers],
  )
  const allProviderIds = useMemo(
    () => providersWithPricing.map(({ providerId }) => providerId),
    [providersWithPricing],
  )
  const selectedProviderIds = useMemo(() => {
    if (requestedProviderIds === null) {
      return new Set(allProviderIds)
    }

    const availableProviderIds = new Set(allProviderIds)
    return new Set(
      requestedProviderIds.filter((providerId) => availableProviderIds.has(providerId)),
    )
  }, [allProviderIds, requestedProviderIds])

  // Legend entries and colors derive from the full provider list. Replacement
  // endpoint UUIDs with a shared tag therefore retain one visual identity, and
  // hiding a provider or loading the chart chunk can never change the identity
  // of what is already on screen.
  const legendEntries =
    history === undefined
      ? undefined
      : providersWithPricing.map((provider, colorIndex) => ({
          provider,
          color: endpointColor(colorIndex, providersWithPricing.length),
        }))

  const renderableProviders = (legendEntries ?? []).filter(({ provider }) =>
    hasProviderMetricHistory(provider, metric),
  )

  const visibleProviders = renderableProviders.filter(({ provider }) =>
    selectedProviderIds.has(provider.providerId),
  )

  const handleMetricChange = (values: string[]) => {
    const [nextMetric] = values
    if (nextMetric !== undefined && isPricingMetric(nextMetric)) {
      void setRequestedMetric(nextMetric)
    }
  }

  const setProviderSelection = (next: ReadonlySet<string>) => {
    const providerIds = allProviderIds.filter((providerId) => next.has(providerId))
    void setRequestedProviderIds(providerIds.length === allProviderIds.length ? null : providerIds)
  }

  const toggleProvider = (providerId: string) => {
    const next = new Set(selectedProviderIds)
    if (next.has(providerId)) {
      next.delete(providerId)
    } else {
      next.add(providerId)
    }
    setProviderSelection(next)
  }

  const toggleAllProviders = () => {
    const next = new Set(selectedProviderIds)
    for (const { provider } of renderableProviders) {
      if (visibleProviders.length === renderableProviders.length) {
        next.delete(provider.providerId)
      } else {
        next.add(provider.providerId)
      }
    }
    setProviderSelection(next)
  }

  // A preset is a window covering the most recent duration.
  const presetWindow = (duration: number): ZoomWindow => ({
    start: Math.max(0, 100 - (duration / historySpan) * 100),
    end: 100,
  })
  const visibleSpan = (historySpan * (zoomWindow.end - zoomWindow.start)) / 100

  const setProviderEmphasis = (providerId: string, emphasized: boolean) => {
    if (!selectedProviderIds.has(providerId)) {
      return
    }

    plotRef.current?.setSeriesEmphasis(providerId, emphasized)
  }

  if (!history) {
    return (
      <Card aria-busy="true" className="bg-card/50" size="sm">
        <PricingHistoryHeader modelName={modelName} modelSlug={modelSlug} />
        <CardContent>
          <output className="flex h-[414px] flex-col items-center justify-center gap-2 text-muted-foreground">
            <Spinner />
            <span>Loading pricing history…</span>
          </output>
        </CardContent>
      </Card>
    )
  }

  const legendAt = scrubTimestamp ?? history.asOf
  const legendPriceLabel = `at ${HISTORY_DATE_TIME_FORMATTER.format(legendAt)}`
  const metricMetadata = pricingMetricMetadata(metric)

  return (
    <Card className="bg-card/50" size="sm">
      <PricingHistoryHeader modelName={modelName} modelSlug={modelSlug} visibleSpan={visibleSpan} />

      <CardContent className="flex flex-col gap-3">
        {/* Chart with history slider */}
        <div className="relative h-[414px] overflow-hidden">
          {hasPricingHistory ? (
            <>
              <div
                className={cn(
                  'h-full w-full transition-opacity duration-150',
                  visibleProviders.length === 0 && 'pointer-events-none opacity-0',
                )}
              >
                <PricingHistoryPlot
                  handleRef={plotRef}
                  history={history}
                  metric={metric}
                  onAxisHoverChange={setScrubTimestamp}
                  onSeriesHoverChange={setHoveredProviderId}
                  onZoomWindowChange={setZoomWindow}
                  selectedProviderIds={selectedProviderIds}
                />
              </div>
              {visibleProviders.length === 0 ? (
                <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-muted-foreground">
                  Select a provider below to render its pricing history.
                </p>
              ) : null}
            </>
          ) : (
            <p className="flex h-full items-center justify-center px-6 text-center text-muted-foreground">
              No pricing data found.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Pricing Metric Control */}
          {displayedMetrics.length <= MAX_METRIC_TOGGLES ? (
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
          ) : (
            <Select
              items={displayedMetrics.map((candidate) => ({
                value: candidate.key,
                label: candidate.label,
              }))}
              onValueChange={(value) => {
                if (typeof value === 'string' && isPricingMetric(value)) {
                  void setRequestedMetric(value)
                }
              }}
              value={hasPricingHistory ? metric : null}
            >
              <SelectTrigger aria-label="Pricing metric" className="min-w-36 shadow-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {displayedMetrics.map((candidate) => (
                  <SelectItem
                    disabled={!availableMetrics.some(({ key }) => key === candidate.key)}
                    key={candidate.key}
                    value={candidate.key}
                  >
                    {candidate.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Range buttons */}
          <div className="flex items-center gap-1">
            <Button
              className="min-w-12 px-3 active:scale-[0.96]"
              disabled={!hasPricingHistory}
              onClick={() => plotRef.current?.zoomTo(FULL_HISTORY_WINDOW)}
              variant="outline"
            >
              All
            </Button>
            {ZOOM_PRESETS.map((preset) => (
              <Button
                className="min-w-12 px-3 active:scale-[0.96]"
                disabled={historySpan < preset.duration}
                key={preset.label}
                onClick={() => plotRef.current?.zoomTo(presetWindow(preset.duration))}
                variant="outline"
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>

      <CardFooter className="border-t">
        {/* Legend section */}
        <div className="flex w-full flex-col gap-1">
          <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1">
            <div className="flex items-center gap-2">
              <p className="font-medium">{metricMetadata.label}</p>
              <p className="shrink-0 text-muted-foreground">{metricMetadata.historyUnitLabel}</p>
              <span aria-hidden className="text-muted-foreground/70">
                ·
              </span>
              <p className="min-w-56 flex-1 truncate text-muted-foreground tabular-nums">
                {legendPriceLabel}
              </p>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <p aria-live="polite" className="text-muted-foreground tabular-nums">
                {`${visibleProviders.length} of ${renderableProviders.length} providers`}
              </p>
              <Button
                className="active:scale-[0.96]"
                disabled={renderableProviders.length === 0}
                onClick={toggleAllProviders}
                variant="ghost"
              >
                {visibleProviders.length === renderableProviders.length ? 'Hide all' : 'Show all'}
              </Button>
            </div>
          </div>

          <PricingHistoryLegend
            at={legendAt}
            entries={legendEntries}
            hoveredProviderId={hoveredProviderId}
            metric={metric}
            onEmphasisChange={setProviderEmphasis}
            onToggleProvider={toggleProvider}
            selectedProviderIds={selectedProviderIds}
          />
        </div>
      </CardFooter>
    </Card>
  )
}

function PricingHistoryHeader({
  modelName,
  modelSlug,
  visibleSpan,
}: {
  modelName: string
  modelSlug: string
  visibleSpan?: number
}) {
  return (
    <CardHeader className="border-b">
      <CardTitle className="flex h-full items-center">
        <EntityIdentity slug={modelSlug} name={modelName} />
      </CardTitle>
      <CardAction className="flex h-full items-center gap-1 text-right text-xs">
        <Badge className="mt-px self-start font-mono uppercase" variant="outline">
          Beta
        </Badge>
        <div>
          <h1 className="text-xs font-medium">Model Pricing History</h1>
          <p className="text-muted-foreground tabular-nums">
            {visibleSpan === undefined
              ? 'Loading history…'
              : `Showing ${durationLabel(visibleSpan)}`}
          </p>
        </div>
      </CardAction>
    </CardHeader>
  )
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
