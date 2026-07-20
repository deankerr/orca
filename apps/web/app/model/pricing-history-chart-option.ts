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

/** Whether a series ever had an observable price for the metric. Shared by the
 * card's legend (runtime-light module) and the plot's rendered-series filter. */
export function hasMetricHistory(series: PricingSeries, metric: PricingMetric) {
  return series.points.some((point) => point.available && point.pricing[metric] !== undefined)
}

/** History stores state transitions, so an endpoint's price at any instant is
 * its most recent observation at or before it. Undefined while unavailable. */
export function priceAt(series: PricingSeries, metric: PricingMetric, at: number) {
  const state = stateAt(series, at)
  return state?.available === true ? state.pricing[metric] : undefined
}

const DATA_ZOOM_THROTTLE = ms('16ms')
// 390px chart height comfortably fits ~18 tooltip rows plus its heading.
const TOOLTIP_SINGLE_COLUMN_MAX_ROWS = 16
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
      // The hovered X always snaps to a change event, and the legend below the
      // chart is the full standings board. The tooltip only tells the event's
      // story: which endpoints have an observation here, and what moved.
      formatter: (params: unknown) => {
        const at = axisTimestampFromTooltipParams(params)
        if (at === null) {
          return ''
        }

        return buildTooltipHtml({
          at,
          context: args.context,
          endpointCount: args.allSeries.length,
          endpointIndexes,
          mutedColor: theme.mutedForeground,
          params: Array.isArray(params) ? (params as unknown[]) : [params],
        })
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

/** The axis-trigger payload is an array of matched points; the hovered X value rides on each. */
function axisTimestampFromTooltipParams(params: unknown): number | null {
  const first: unknown = Array.isArray(params) ? (params as unknown[])[0] : params
  if (typeof first !== 'object' || first === null || !('axisValue' in first)) {
    return null
  }

  const { axisValue } = first
  if (typeof axisValue === 'number') {
    return axisValue
  }
  if (typeof axisValue === 'string' || axisValue instanceof Date) {
    const timestamp = Number(new Date(axisValue))
    return Number.isNaN(timestamp) ? null : timestamp
  }
  return null
}

/** History stores state transitions, so an endpoint's price at any instant is
 * its most recent observation at or before it. */
function stateAt(series: PricingSeries, at: number) {
  let state: PricingSeries['points'][number] | undefined
  for (const point of series.points) {
    if (point.at > at) {
      break
    }
    state = point
  }
  return state
}

function buildTooltipHtml(args: {
  at: number
  context: ZoomContext
  endpointCount: number
  endpointIndexes: ReadonlyMap<string, number>
  mutedColor: string
  params: readonly unknown[]
}) {
  const seenSeriesNames = new Set<string>()
  const rows: { color: string; name: string; price: number; priceCell: string }[] = []

  // Availability gaps split one endpoint into several chart series with the
  // same name, so the matched params are deduplicated per endpoint.
  for (const param of args.params) {
    const seriesName = seriesNameFromTooltipParam(param)
    if (seriesName === null || seenSeriesNames.has(seriesName)) {
      continue
    }
    seenSeriesNames.add(seriesName)

    const series = args.context.series.find(
      (candidate) => candidate.provider.tag_slug === seriesName,
    )
    const colorIndex =
      series === undefined ? undefined : args.endpointIndexes.get(series.endpointUuid)
    const price = priceFromTooltipParam(param)
    if (series === undefined || colorIndex === undefined || price === undefined) {
      continue
    }

    rows.push({
      color: endpointSrgbColor(colorIndex, args.endpointCount),
      name: seriesName,
      price,
      priceCell: describePriceEvent(series, args.context.metric, args.at, price, args.mutedColor),
    })
  }

  rows.sort((left, right) => right.price - left.price)

  if (rows.length === 0) {
    return ''
  }

  const heading = new Date(args.at).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const items = rows.map(
    (row) => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;break-inside:avoid">
        <span style="display:flex;align-items:center;gap:6px;min-width:0">
          <span style="flex-shrink:0;width:8px;height:8px;border-radius:9999px;background:${row.color}"></span>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(row.name)}</span>
        </span>
        <span>${row.priceCell}</span>
      </div>`,
  )
  // Long lists flow into two columns so the docked tooltip stays shorter than
  // the chart instead of spilling past its bottom edge.
  const columnCount = rows.length > TOOLTIP_SINGLE_COLUMN_MAX_ROWS ? 2 : 1

  return `<div style="line-height:1.5">
    <div style="margin-bottom:4px;color:${args.mutedColor}">${escapeHtml(heading)}</div>
    <div style="columns:${columnCount};column-gap:24px;min-width:${columnCount * 200}px">${items.join('')}</div>
  </div>`
}

/** Describes what happened to an endpoint's price at a change event: a delta
 * for repricing, "new" for a first observation, "unlisted" when the matched
 * datum is the synthetic point that closes a segment at a disappearance. */
function describePriceEvent(
  series: PricingSeries,
  metric: PricingMetric,
  at: number,
  price: number,
  mutedColor: string,
) {
  const muted = (text: string) => `<span style="color:${mutedColor}">${text}</span>`
  const current = escapeHtml(formatChartPrice(metric, price, true))

  const eventPoint = series.points.find((point) => point.at === at)
  if (
    eventPoint !== undefined &&
    (!eventPoint.available || eventPoint.pricing[metric] === undefined)
  ) {
    return `${escapeHtml(formatChartPrice(metric, price, false))} ${muted('→ unlisted')}`
  }

  const previous = priceAt(series, metric, at - 1)
  if (previous === undefined) {
    return `${muted('new ·')} ${current}`
  }
  if (previous !== price) {
    return `${muted(`${escapeHtml(formatChartPrice(metric, previous, false))} →`)} ${current}`
  }
  return current
}

function seriesNameFromTooltipParam(param: unknown): string | null {
  if (typeof param !== 'object' || param === null) {
    return null
  }

  const candidate = param as { seriesName?: unknown }
  return typeof candidate.seriesName === 'string' ? candidate.seriesName : null
}

function priceFromTooltipParam(param: unknown): number | undefined {
  if (typeof param !== 'object' || param === null) {
    return undefined
  }

  const { value } = param as { value?: unknown }
  if (!Array.isArray(value)) {
    return undefined
  }

  const [, price] = value as unknown[]
  return typeof price === 'number' ? price : undefined
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
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
