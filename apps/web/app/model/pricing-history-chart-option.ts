import { formatPricing, pricingScale } from '@orca/backend/shared/formatters'
import type { LineSeriesOption } from 'echarts/charts'
import type { EChartsCoreOption } from 'echarts/core'
import ms from 'ms'

import { pricingMetricMetadata } from './pricing-fields'
import { endpointSrgbColor } from './pricing-history-colors'
import type { EndpointPricingHistory, PricingMetric } from './types'

export const ZOOM_ANIMATION_DURATION = ms('220ms')

export type PricingSeries = EndpointPricingHistory['series'][number]

export type ZoomContext = {
  since: number
  asOf: number
  series: readonly PricingSeries[]
  metric: PricingMetric
}

export type ZoomWindow = {
  start: number
  end: number
}

/** ECharts expresses data-zoom windows as percentages of the complete X-axis. */
export const FULL_HISTORY_WINDOW: ZoomWindow = { start: 0, end: 100 }

const DATA_ZOOM_THROTTLE = ms('16ms')
const INTRADAY_LABEL_WINDOW = ms('5d')
const DAILY_LABEL_WINDOW = ms('90d')
const MONO_FONT_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'

type AvailablePriceSegment = {
  id: string
  providerId: string
  color: string
  data: NonNullable<LineSeriesOption['data']>
}

export function createPricingHistoryChartOption(args: {
  allSeries: readonly PricingSeries[]
  animateUpdates: boolean
  context: ZoomContext
  isDark: boolean
  zoom: ZoomWindow
}): EChartsCoreOption {
  // Keep colors tied to the complete endpoint list. Hiding an endpoint must not
  // cause every remaining line and legend control to change identity.
  const endpointIndexes = new Map(
    args.allSeries.map((series, index) => [series.endpointUuid, index]),
  )
  const segments = buildAvailablePriceSegments(
    args.context.series,
    args.context.metric,
    endpointIndexes,
    args.allSeries.length,
  )
  const theme = chartTheme(args.isDark)
  const axes = axesForZoomWindow(args.context, args.zoom)

  const lineSeries: LineSeriesOption[] = segments.map((segment) => ({
    id: segment.id,
    name: segment.providerId,
    type: 'line',
    data: segment.data,
    animation: true,
    clip: true,
    connectNulls: false,
    emphasis: {
      focus: 'series',
      lineStyle: { width: 3 },
    },
    itemStyle: {
      // A surface-colored keyline separates dense markers without recreating
      // the conspicuous white rings that prompted the earlier styling change.
      borderColor: theme.markerKeyline,
      borderWidth: 1,
      color: segment.color,
    },
    lineStyle: {
      color: segment.color,
      width: 2,
    },
    showSymbol: true,
    symbol: 'circle',
    symbolSize: 6,
    tooltip: {
      valueFormatter: (value) => {
        const price = Array.isArray(value) ? Number(value[1]) : Number(value)
        return formatChartPrice(args.context.metric, price, true)
      },
    },
  }))

  return {
    animationDuration: 0,
    animationDurationUpdate: args.animateUpdates ? ZOOM_ANIMATION_DURATION : 0,
    animationEasingUpdate: 'cubicOut',
    aria: {
      enabled: true,
      description: `${pricingMetricMetadata(args.context.metric).label} pricing history for ${args.context.series.length} endpoints.`,
    },
    dataZoom: [
      {
        id: 'pricing-history-inside',
        type: 'inside',
        start: args.zoom.start,
        end: args.zoom.end,
        // The full series remains available while zoomed so the navigator and
        // our viewport-aware Y-axis can derive state at the left boundary.
        filterMode: 'none',
        moveOnMouseMove: true,
        moveOnMouseWheel: false,
        throttle: DATA_ZOOM_THROTTLE,
        zoomOnMouseWheel: true,
      },
      {
        id: 'pricing-history-slider',
        type: 'slider',
        start: args.zoom.start,
        end: args.zoom.end,
        bottom: 8,
        height: 24,
        borderColor: theme.border,
        borderRadius: 4,
        brushSelect: true,
        dataBackground: {
          areaStyle: { color: 'transparent' },
          lineStyle: { color: theme.mutedForeground, opacity: 0.25 },
        },
        fillerColor: args.isDark ? 'rgba(163, 163, 163, 0.14)' : 'rgba(115, 115, 115, 0.14)',
        filterMode: 'none',
        handleLabel: { show: false },
        handleSize: 18,
        handleStyle: {
          borderColor: theme.mutedForeground,
          borderWidth: 1,
          color: theme.card,
        },
        moveHandleSize: 8,
        moveHandleStyle: { color: theme.mutedForeground, opacity: 0.35 },
        selectedDataBackground: {
          areaStyle: {
            color: args.isDark ? 'rgba(163, 163, 163, 0.1)' : 'rgba(115, 115, 115, 0.1)',
          },
          lineStyle: { color: theme.mutedForeground, opacity: 0.6 },
        },
        showDataShadow: false,
        showDetail: false,
        throttle: DATA_ZOOM_THROTTLE,
      },
    ],
    grid: {
      left: 58,
      right: 16,
      top: 16,
      bottom: 66,
    },
    series: lineSeries,
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderWidth: 1,
      confine: true,
      textStyle: {
        color: theme.foreground,
        fontFamily: MONO_FONT_FAMILY,
        fontSize: 12,
      },
      axisPointer: {
        type: 'line',
        lineStyle: { color: theme.mutedForeground, opacity: 0.45, width: 1 },
      },
    },
    xAxis: {
      type: 'time',
      min: args.context.since,
      max: args.context.asOf,
      axisLabel: {
        color: theme.mutedForeground,
        fontFamily: MONO_FONT_FAMILY,
        formatter: axes.xAxisLabelFormatter,
        hideOverlap: true,
      },
      axisLine: { lineStyle: { color: theme.border } },
      axisTick: { lineStyle: { color: theme.border } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      min: 0,
      interval: axes.priceAxis.interval,
      max: axes.priceAxis.max,
      splitNumber: 5,
      axisLabel: {
        color: theme.mutedForeground,
        fontFamily: MONO_FONT_FAMILY,
        formatter: (value: number) => formatChartPrice(args.context.metric, value, false),
        showMaxLabel: false,
      },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: theme.border, opacity: 0.65 } },
    },
  }
}

/** Return the small option patch needed for high-frequency zoom events. */
export function createZoomedAxesOption(context: ZoomContext, zoom: ZoomWindow): EChartsCoreOption {
  const axes = axesForZoomWindow(context, zoom)

  return {
    xAxis: { axisLabel: { formatter: axes.xAxisLabelFormatter } },
    yAxis: { interval: axes.priceAxis.interval, max: axes.priceAxis.max },
  }
}

function buildAvailablePriceSegments(
  seriesList: readonly PricingSeries[],
  metric: PricingMetric,
  endpointIndexes: ReadonlyMap<string, number>,
  endpointCount: number,
) {
  const segments: AvailablePriceSegment[] = []

  for (const series of seriesList) {
    const colorIndex = endpointIndexes.get(series.endpointUuid)
    if (colorIndex === undefined) {
      continue
    }

    let segmentIndex = 0
    let data: NonNullable<LineSeriesOption['data']> = []

    const flushSegment = () => {
      if (data.length === 0) {
        return
      }

      segments.push({
        id: `${series.endpointUuid}:${segmentIndex}`,
        providerId: series.provider.tag_slug,
        color: endpointSrgbColor(colorIndex, endpointCount),
        data,
      })
      segmentIndex += 1
      data = []
    }

    // Availability gaps become distinct ECharts series. Connecting across a
    // gap would falsely claim that the endpoint could be used during it.
    for (let index = 0; index < series.points.length; index += 1) {
      const point = series.points[index]
      const nextPoint = series.points[index + 1]
      const price = point.pricing[metric]

      if (!point.available || price === undefined) {
        flushSegment()
        continue
      }

      // Keep raw catalog prices in the series. Shared pricing metadata formats
      // token, image, request, and percentage values in their native units.
      data.push([point.at, price])

      const nextPrice = nextPoint?.pricing[metric]
      if (
        nextPoint !== undefined &&
        nextPoint.at > point.at &&
        (!nextPoint.available || nextPrice === undefined)
      ) {
        // Extend the previous price exactly to the disappearance time, but do
        // not draw a marker that could be mistaken for an observed price.
        data.push({ symbolSize: 0, value: [nextPoint.at, price] })
      }

      if (nextPoint === undefined || !nextPoint.available || nextPrice === undefined) {
        flushSegment()
      }
    }

    flushSegment()
  }

  return segments
}

function axesForZoomWindow(context: ZoomContext, zoom: ZoomWindow) {
  const windowDuration = ((context.asOf - context.since) * (zoom.end - zoom.start)) / 100

  return {
    priceAxis: priceAxisForWindow(context, zoom),
    xAxisLabelFormatter: (value: number) => formatAxisDate(value, windowDuration),
  }
}

function priceAxisForWindow(context: ZoomContext, zoom: ZoomWindow) {
  const windowStart = context.since + ((context.asOf - context.since) * zoom.start) / 100
  const windowEnd = context.since + ((context.asOf - context.since) * zoom.end) / 100
  let maximum = 0

  for (const series of context.series) {
    let stateAtWindowStart: PricingSeries['points'][number] | undefined

    // History stores state transitions rather than a sample at every instant.
    // Include the last observation before the viewport so a flat line that
    // crosses its left edge still contributes to the visible Y-domain.
    for (const point of series.points) {
      if (point.at <= windowStart) {
        stateAtWindowStart = point
      }

      if (point.at > windowEnd) {
        break
      }

      if (point.at >= windowStart) {
        const price = point.available ? point.pricing[context.metric] : undefined
        if (price !== undefined) {
          maximum = Math.max(maximum, price)
        }
      }
    }

    const startingPrice =
      stateAtWindowStart?.available === true
        ? stateAtWindowStart.pricing[context.metric]
        : undefined
    if (startingPrice !== undefined) {
      maximum = Math.max(maximum, startingPrice)
    }
  }

  // A zero-price series still needs a useful domain. One display-unit means
  // $1/MTOK, $1/K images, $1/request, or 1% depending on the selected metric.
  const max = maximum === 0 ? 1 / pricingScale(context.metric) : maximum * 1.04
  const approximateInterval = max / 6
  const magnitude = 10 ** Math.floor(Math.log10(approximateInterval))
  const normalized = approximateInterval / magnitude
  const intervalMultiplier = normalized <= 1.5 ? 1 : normalized <= 3 ? 2 : normalized <= 7 ? 5 : 10

  return { interval: intervalMultiplier * magnitude, max }
}

function formatAxisDate(value: number, windowDuration: number) {
  const date = new Date(value)
  if (windowDuration <= INTRADAY_LABEL_WINDOW) {
    const day = date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
    const time = date.toLocaleTimeString('en-AU', {
      hour: '2-digit',
      hour12: false,
      minute: '2-digit',
    })
    return `${day}\n${time}`
  }

  if (windowDuration <= DAILY_LABEL_WINDOW) {
    return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  }

  return date.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
}

function formatChartPrice(metric: PricingMetric, value: number, includeUnit: boolean) {
  const formatted = formatPricing(metric, value)
  if (formatted === null) {
    return '—'
  }

  return includeUnit && formatted.unit ? `${formatted.value}/${formatted.unit}` : formatted.value
}

function chartTheme(isDark: boolean) {
  return {
    border: isDark ? 'rgba(255, 255, 255, 0.1)' : '#e5e5e5',
    card: isDark ? '#171717' : '#ffffff',
    foreground: isDark ? '#fafafa' : '#171717',
    markerKeyline: isDark ? 'rgba(10, 10, 10, 0.72)' : 'rgba(255, 255, 255, 0.82)',
    mutedForeground: isDark ? '#a3a3a3' : '#737373',
  }
}
