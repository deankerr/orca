'use client'

import { api } from '@orca/backend-experimental/convex/_generated/api'
import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import ms from 'ms'
import { useMemo, useState } from 'react'

import { EvilLineChart } from '@/components/evilcharts/charts/line-chart'
import type { ChartConfig } from '@/components/evilcharts/ui/chart'
import { CardContent } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import { ModelPageCard } from './model-page-card'
import type { ModelEndpoint } from './types'
import { formatNumber } from './utils'

type StatsSample = FunctionReturnType<typeof api.endpointStats.listForModel>[number]
type StatsMetric = 'p50Latency' | 'p50Throughput'
type StatsChartRow = {
  observedAt: number
} & Record<string, number | null>

const STATS_WINDOWS = [
  { days: 3, label: '3D', tickCount: 3 },
  { days: 14, label: '14D', tickCount: 5 },
  { days: 30, label: '30D', tickCount: 6 },
] as const
type StatsWindow = (typeof STATS_WINDOWS)[number]

const [initialStatsWindow] = STATS_WINDOWS
// oxlint-disable-next-line prefer-destructuring
const queryStatsWindow = STATS_WINDOWS[2]

function useEndpointStatsQuery(modelId: string) {
  const [now] = useState(() => Math.floor(Date.now() / ms('1 hour')) * ms('1 hour'))
  const querySince = now - queryStatsWindow.days * ms('1 day')
  const samples = useQuery(api.endpointStats.listForModel, { modelId, since: querySince })

  return {
    isLoading: samples === undefined,
    now,
    samples: samples ?? [],
  }
}

const chartProps = { margin: { bottom: 0, left: 0, right: 8, top: 12 } }

export function ProviderStatsCard({
  endpoints,
  metric,
  modelId,
  title,
}: {
  endpoints: readonly ModelEndpoint[]
  metric: StatsMetric
  modelId: string
  title: string
}) {
  const stats = useEndpointStatsQuery(modelId)
  const [selectedWindow, setSelectedWindow] = useState<StatsWindow>(initialStatsWindow)

  // Show a longer window only once the previous window has metric data across its full span.
  const visibleWindows: StatsWindow[] = []

  for (const [index, statsWindow] of STATS_WINDOWS.entries()) {
    const previousWindow = STATS_WINDOWS[index - 1]

    if (previousWindow === undefined) {
      visibleWindows.push(statsWindow)
      continue
    }

    const previousWindowSince = stats.now - previousWindow.days * ms('1 day')
    const previousWindowIsFull = stats.samples.some(
      (sample) =>
        sample.statsObserved &&
        sample[metric] !== undefined &&
        sample.observedAt <= previousWindowSince,
    )

    if (previousWindowIsFull) {
      visibleWindows.push(statsWindow)
    }
  }

  // Keep stale selections from model changes from rendering unavailable windows.
  const window = visibleWindows.includes(selectedWindow) ? selectedWindow : initialStatsWindow
  const windowSince = stats.now - window.days * ms('1 day')

  // Filter the max-range query down to the currently visible client-side window.
  const chartModel = useMemo(
    () =>
      buildChartModel({
        endpoints,
        metric,
        samples: stats.samples,
        since: windowSince,
      }),
    [endpoints, metric, stats.samples, windowSince],
  )

  // Build date-only x-axis ticks from the selected window's configured tick count.
  const tickDate = new Date(windowSince)
  tickDate.setHours(0, 0, 0, 0)
  if (tickDate.getTime() < windowSince) {
    tickDate.setDate(tickDate.getDate() + 1)
  }

  const tickIntervalDays = Math.max(1, Math.ceil(window.days / window.tickCount))
  const xTicks: number[] = []
  while (xTicks.length < window.tickCount && tickDate.getTime() <= stats.now) {
    xTicks.push(tickDate.getTime())
    tickDate.setDate(tickDate.getDate() + tickIntervalDays)
  }

  const handleWindowChange = (values: string[]) => {
    const days = Number(values[0])
    const nextWindow = visibleWindows.find((statsWindow) => statsWindow.days === days)

    if (nextWindow === undefined) {
      return
    }

    setSelectedWindow(nextWindow)
  }

  return (
    <ModelPageCard title={title}>
      <CardContent className="grid min-w-0 gap-4 overflow-hidden">
        <div className="flex justify-end">
          <ToggleGroup
            multiple={false}
            value={[String(window.days)]}
            onValueChange={handleWindowChange}
            size="sm"
            variant="outline"
            aria-label="Stats time window"
          >
            {visibleWindows.map((statsWindow) => (
              <ToggleGroupItem key={statsWindow.days} value={String(statsWindow.days)}>
                {statsWindow.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {!stats.isLoading && chartModel.rows.length === 0 ? (
          <div className="rounded-md border px-3 py-8 text-center text-sm text-muted-foreground">
            No recent {title.toLowerCase()} observations.
          </div>
        ) : (
          <EvilLineChart
            chartConfig={chartModel.chartConfig}
            data={chartModel.rows}
            xDataKey="observedAt"
            yDataKey={chartModel.yDataKey}
            className="h-[20rem] min-w-0 sm:h-[24rem] md:h-[28rem] lg:h-[34rem]"
            chartProps={chartProps}
            connectNulls
            curveType="monotone"
            hideCursorLine
            isClickable
            isLoading={stats.isLoading}
            tickGap={24}
            xAxisProps={{
              domain: [windowSince, stats.now],
              interval: 0,
              scale: 'time',
              tickFormatter: (value) =>
                new Date(Number(value)).toLocaleString('en-US', {
                  day: 'numeric',
                  month: 'short',
                }),
              ticks: xTicks,
              type: 'number',
            }}
            yAxisProps={{
              tickFormatter: (value) => {
                const formattedValue = formatNumber(Number(value))

                if (metric === 'p50Latency') {
                  return `${formattedValue} ms`
                }

                return formattedValue
              },
            }}
          />
        )}
      </CardContent>
    </ModelPageCard>
  )
}

function buildChartModel(args: {
  endpoints: readonly ModelEndpoint[]
  metric: StatsMetric
  samples: readonly StatsSample[]
  since: number
}) {
  // Seed one chart series per provider from the model's endpoint list.
  const providers = new Map<string, { key: string; label: string; observedCount: number }>()
  const valuesByObservedAt = new Map<number, Map<string, number[]>>()

  for (const endpoint of args.endpoints) {
    if (providers.has(endpoint.providerId)) {
      continue
    }

    providers.set(endpoint.providerId, {
      key: `series${providers.size}`,
      label: endpoint.providerName,
      observedCount: 0,
    })
  }

  // Group matching samples by timestamp and provider series.
  for (const sample of args.samples) {
    if (sample.observedAt < args.since || !sample.statsObserved) {
      continue
    }

    const value = sample[args.metric]
    const series = providers.get(sample.providerId)
    if (value === undefined || series === undefined) {
      continue
    }

    series.observedCount += 1
    const row = valuesByObservedAt.get(sample.observedAt) ?? new Map<string, number[]>()
    const values = row.get(series.key) ?? []

    values.push(value)
    row.set(series.key, values)
    valuesByObservedAt.set(sample.observedAt, row)
  }

  // Keep only providers with visible observations and stabilize legend order.
  const series = [...providers.values()]
    .filter((provider) => provider.observedCount > 0)
    .toSorted((left, right) => left.label.localeCompare(right.label))

  // Assign deterministic chart colors after sorting so providers keep stable labels.
  const chartConfig: ChartConfig = Object.fromEntries(
    series.map((provider, index) => {
      const GOLDEN_ANGLE = 137.508
      const DARK_LIGHTNESS = [0.76, 0.68, 0.82]
      const LIGHT_LIGHTNESS = [0.52, 0.44, 0.6]
      const COLOR_CHROMA = [0.18, 0.14, 0.22]
      const hue = (index * GOLDEN_ANGLE) % 360
      const chroma = COLOR_CHROMA[index % 3]

      return [
        provider.key,
        {
          colors: {
            dark: [`oklch(${DARK_LIGHTNESS[index % 3]} ${chroma} ${hue.toFixed(1)}deg)`],
            light: [`oklch(${LIGHT_LIGHTNESS[index % 3]} ${chroma} ${hue.toFixed(1)}deg)`],
          },
          label: provider.label,
        },
      ]
    }),
  )

  // Collapse multiple endpoint values for the same provider/timestamp into one row value.
  const rows: StatsChartRow[] = [...valuesByObservedAt.entries()]
    .toSorted(([left], [right]) => left - right)
    .map(([observedAt, valuesBySeries]) => {
      const row: StatsChartRow = { observedAt }

      for (const provider of series) {
        const values = valuesBySeries.get(provider.key)
        const value =
          values === undefined
            ? null
            : values.reduce((total, item) => total + item, 0) / values.length

        row[provider.key] = value
      }

      return row
    })

  // Return the first series key only as a render guard; the Y axis derives its own domain.
  return {
    chartConfig,
    rows,
    yDataKey: series[0]?.key,
  }
}
