'use client'

import { api } from '@orca/backend/convex/_generated/api'
import { useQuery } from 'convex/react'
import dynamic from 'next/dynamic'
import { useMemo, useState } from 'react'

import { CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import { ModelPageCard } from './model-page-card'
import { isPricingMetric, PRICING_METRICS } from './pricing-fields'
import type { PricingMetric } from './types'

// ECharts is browser-only and relatively heavy. Keep it out of the server render
// and defer its client chunk until a model page actually needs the chart.
const PricingHistoryPlot = dynamic(
  async () => {
    const plotModule = await import('./pricing-history-plot')
    return plotModule.PricingHistoryPlot
  },
  {
    ssr: false,
    loading: () => <ChartLoadingState label="Loading chart" />,
  },
)

export function PricingHistoryCard({ modelSlug }: { modelSlug: string }) {
  const [requestedMetric, setRequestedMetric] = useState<PricingMetric>('text_input')
  // Fetch the complete retained history once. The navigator changes only the
  // client viewport, so exploring a different period never changes page height
  // or starts another backend subscription.
  const history = useQuery(api.endpointPricingHistory.get, { modelSlug })
  const availableMetrics = useMemo(
    () =>
      history === undefined
        ? []
        : PRICING_METRICS.filter((candidate) =>
            history.series.some((series) =>
              series.points.some(
                (point) => point.available && point.pricing[candidate.key] !== undefined,
              ),
            ),
          ),
    [history],
  )
  // A model may never have had input pricing. Prefer the user's last explicit
  // choice when it exists, otherwise select the first price observed in history.
  const metric = availableMetrics.some(({ key }) => key === requestedMetric)
    ? requestedMetric
    : (availableMetrics[0]?.key ?? requestedMetric)
  const hasPricingHistory = availableMetrics.length > 0

  const handleMetricChange = (values: string[]) => {
    const [nextMetric] = values
    if (nextMetric !== undefined && isPricingMetric(nextMetric)) {
      setRequestedMetric(nextMetric)
    }
  }

  return (
    <ModelPageCard title="Pricing History">
      <CardContent className="space-y-4 px-2">
        <ToggleGroup
          aria-label="Pricing metric"
          className="shadow-sm"
          multiple={false}
          onValueChange={handleMetricChange}
          size="default"
          value={[metric]}
          variant="outline"
        >
          {availableMetrics.map((candidate) => (
            <ToggleGroupItem
              className="min-w-20 px-4 active:scale-[0.96]"
              key={candidate.key}
              value={candidate.key}
            >
              {candidate.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {history === undefined ? <ChartLoadingState label="Loading pricing history" /> : null}

        {history !== undefined && !hasPricingHistory ? (
          <div className="flex min-h-72 items-center justify-center rounded-md bg-muted/30 px-6 text-center text-muted-foreground">
            No pricing was observed.
          </div>
        ) : null}

        {history !== undefined && hasPricingHistory ? (
          <PricingHistoryPlot history={history} metric={metric} />
        ) : null}
      </CardContent>
    </ModelPageCard>
  )
}

function ChartLoadingState({ label }: { label: string }) {
  return (
    <div className="flex min-h-72 items-center justify-center rounded-md bg-muted/30 text-muted-foreground">
      <Spinner />
      <span className="sr-only">{label}</span>
    </div>
  )
}
