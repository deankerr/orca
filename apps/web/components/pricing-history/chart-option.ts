import { formatPricing, pricingScale } from '@orca/backend/shared/formatters'
import {
  addDays,
  addHours,
  addMonths,
  addWeeks,
  addYears,
  startOfDay,
  startOfHour,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns'
import type { LineSeriesOption } from 'echarts/charts'
import type { EChartsCoreOption } from 'echarts/core'
import ms from 'ms'

import { endpointSrgbColor } from './colors'
import { pricingMetricMetadata } from './pricing-fields'
import { priceAt } from './series'
import type { PricingSeries } from './series'
import type { PricingMetric } from './types'

export const ZOOM_ANIMATION_DURATION = ms('220ms')

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

/** Dispatched zoom windows accrue float error, so compare with a tolerance. */
export function zoomWindowsEqual(a: ZoomWindow, b: ZoomWindow) {
  return Math.abs(a.start - b.start) < 0.01 && Math.abs(a.end - b.end) < 0.01
}

const DATA_ZOOM_THROTTLE = ms('16ms')
// Zooming below a day just shows empty space between snapshot points.
const MIN_ZOOM_SPAN = ms('1d')
// 390px chart height comfortably fits ~18 tooltip rows plus its heading.
const TOOLTIP_SINGLE_COLUMN_MAX_ROWS = 16
const MONO_FONT_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
// Hex mirrors of the dark-theme palette in globals.css - ECharts canvas paints
// cannot reference the CSS custom properties directly.
const CHART_THEME = {
  background: '#0a0a0a', // --background
  border: 'rgba(255, 255, 255, 0.1)', // --border
  card: '#171717', // --card
  foreground: '#fafafa', // --foreground
  markerKeyline: 'rgba(10, 10, 10, 0.72)',
  mutedForeground: '#a3a3a3', // --muted-foreground
  primary: '#e5e5e5', // --primary
  secondary: '#262626', // --secondary
}

// X-axis ticks land on calendar boundaries (midnight, Monday, the 1st) at a
// regular stride instead of ECharts' auto-picked "nice" timestamps, which read
// as random dates. The coarsest stride keeping at most MAX_X_TICKS wins.
const MAX_X_TICKS = 12
type TickUnit = 'hour' | 'day' | 'week' | 'month' | 'year'
const TICK_UNIT_MS: Record<TickUnit, number> = {
  hour: ms('1h'),
  day: ms('1d'),
  week: ms('7d'),
  month: ms('30d'),
  year: ms('365d'),
}
const TICK_STRIDES: { unit: TickUnit; count: number }[] = [
  { unit: 'hour', count: 1 },
  { unit: 'hour', count: 3 },
  { unit: 'hour', count: 6 },
  { unit: 'hour', count: 12 },
  { unit: 'day', count: 1 },
  { unit: 'day', count: 2 },
  { unit: 'day', count: 3 },
  { unit: 'week', count: 1 },
  { unit: 'week', count: 2 },
  { unit: 'month', count: 1 },
  { unit: 'month', count: 3 },
  { unit: 'month', count: 6 },
  { unit: 'year', count: 1 },
]

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
  zoom: ZoomWindow
}): EChartsCoreOption {
  // Keep colors tied to the complete provider list. Replacement endpoint UUIDs
  // sharing a provider tag get the same color, and hiding a provider must not
  // cause every remaining line and legend control to change identity.
  const providerIds = [...new Set(args.allSeries.map((series) => series.provider.tag_slug))]
  const providerIndexes = new Map(providerIds.map((providerId, index) => [providerId, index]))
  const segments = buildAvailablePriceSegments(
    args.context.series,
    args.context.metric,
    providerIndexes,
    providerIds.length,
  )
  const theme = CHART_THEME
  const axes = axesForZoomWindow(args.context, args.zoom)
  // Slider detail labels only need a year once the retained history crosses one.
  const spansMultipleYears =
    new Date(args.context.since).getFullYear() !== new Date(args.context.asOf).getFullYear()

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
      description: `${pricingMetricMetadata(args.context.metric).label} pricing history for ${new Set(args.context.series.map((series) => series.provider.tag_slug)).size} providers.`,
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
        minValueSpan: MIN_ZOOM_SPAN,
        moveOnMouseMove: true,
        moveOnMouseWheel: false,
        throttle: DATA_ZOOM_THROTTLE,
        // Plain wheel scrolls the page; ctrl+wheel zooms. Trackpad pinches
        // arrive as ctrl+wheel events, so pinch-to-zoom works untouched.
        zoomOnMouseWheel: 'ctrl',
      },
      {
        id: 'pricing-history-slider',
        type: 'slider',
        start: args.zoom.start,
        end: args.zoom.end,
        bottom: 8,
        height: 24,
        // Untethered from the plot area: the navigator spans the full card
        // width instead of leaving a stub of dead space under the Y-axis
        // labels. Percentage mapping is unaffected - it is not an axis.
        left: 16,
        right: 16,
        // Solid palette layers, matching the toggle groups above: the groove
        // recesses into the card and the selected window sits on it as the one
        // solid, secondary-colored element.
        // Full-width track behind the window: the recessed groove.
        backgroundColor: theme.background,
        // Hairline around the whole track, same as every card/input border.
        borderColor: theme.border,
        borderRadius: 4,
        // With brush-select off, dragging the track pans the window instead of
        // discarding it for a new selection - the friendlier default for the
        // easiest area to land on.
        brushSelect: false,
        // The selected window between the two handles.
        fillerColor: theme.secondary,
        filterMode: 'none',
        handleLabel: { show: false },
        handleStyle: {
          // Handle fill: the brightest solid on the control, like any primary
          // action. A soft drop shadow lifts it off the flat track.
          color: theme.primary,
          borderColor: theme.border,
          borderWidth: 1,
          shadowBlur: 4,
          shadowColor: 'rgba(0, 0, 0, 0.5)',
          shadowOffsetY: 1,
        },
        labelFormatter: (value: number) => formatSliderDetailDate(value, spansMultipleYears),
        minValueSpan: MIN_ZOOM_SPAN,
        // The window itself is the pan surface; a separate grab bar above the
        // track just added a second, disconnected-looking control.
        moveHandleSize: 0,
        showDataShadow: false,
        // While a handle is dragged, its selected date renders beside it -
        // live feedback for what period the window now covers.
        showDetail: false,
        // Date labels beside the handles (only visible if showDetail is on).
        textStyle: { color: theme.mutedForeground, fontFamily: MONO_FONT_FAMILY },
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
          providerCount: providerIds.length,
          providerIndexes,
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
        customValues: axes.xTicks.values,
        fontFamily: MONO_FONT_FAMILY,
        formatter: axes.xTicks.labelFormatter,
        hideOverlap: true,
      },
      axisLine: { lineStyle: { color: theme.border } },
      axisTick: { customValues: axes.xTicks.values, lineStyle: { color: theme.border } },
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
        showMaxLabel: true,
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
    xAxis: {
      axisLabel: { customValues: axes.xTicks.values, formatter: axes.xTicks.labelFormatter },
      axisTick: { customValues: axes.xTicks.values },
    },
    yAxis: { interval: axes.priceAxis.interval, max: axes.priceAxis.max },
  }
}

function buildAvailablePriceSegments(
  seriesList: readonly PricingSeries[],
  metric: PricingMetric,
  providerIndexes: ReadonlyMap<string, number>,
  providerCount: number,
) {
  const segments: AvailablePriceSegment[] = []

  for (const series of seriesList) {
    const colorIndex = providerIndexes.get(series.provider.tag_slug)
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
        color: endpointSrgbColor(colorIndex, providerCount),
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

function buildTooltipHtml(args: {
  at: number
  context: ZoomContext
  providerCount: number
  providerIndexes: ReadonlyMap<string, number>
  mutedColor: string
  params: readonly unknown[]
}) {
  const rowsByProvider = new Map<
    string,
    { color: string; name: string; price: number; priceCell: string; priority: number }
  >()

  // Availability gaps and replacement endpoint UUIDs create several chart
  // series with the same provider name. Resolve the raw endpoint from the
  // segment ID for an accurate event description, then keep one provider row.
  for (const param of args.params) {
    const seriesName = seriesNameFromTooltipParam(param)
    const seriesId = seriesIdFromTooltipParam(param)
    if (seriesName === null || seriesId === null) {
      continue
    }

    const series = args.context.series.find((candidate) =>
      seriesId.startsWith(`${candidate.endpointUuid}:`),
    )
    const colorIndex = args.providerIndexes.get(seriesName)
    const price = priceFromTooltipParam(param)
    if (series === undefined || colorIndex === undefined || price === undefined) {
      continue
    }

    const eventPoint = series.points.find((point) => point.at === args.at)
    const priority = eventPoint?.available === true ? 2 : eventPoint === undefined ? 1 : 0
    if ((rowsByProvider.get(seriesName)?.priority ?? -1) >= priority) {
      continue
    }

    rowsByProvider.set(seriesName, {
      color: endpointSrgbColor(colorIndex, args.providerCount),
      name: seriesName,
      price,
      priceCell: describePriceEvent(series, args.context.metric, args.at, price, args.mutedColor),
      priority,
    })
  }

  const rows = [...rowsByProvider.values()]
  rows.sort((left, right) => right.price - left.price)

  if (rows.length === 0) {
    return ''
  }

  const heading = new Date(args.at).toLocaleString('en-US', {
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

function seriesIdFromTooltipParam(param: unknown): string | null {
  if (typeof param !== 'object' || param === null) {
    return null
  }

  const candidate = param as { seriesId?: unknown }
  return typeof candidate.seriesId === 'string' ? candidate.seriesId : null
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
  const span = context.asOf - context.since
  const windowStart = context.since + (span * zoom.start) / 100
  const windowEnd = context.since + (span * zoom.end) / 100
  const ticks = calendarTicks(windowStart, windowEnd)

  return {
    priceAxis: priceAxisForWindow(context, zoom),
    xTicks: {
      values: ticks.values,
      labelFormatter: (value: number) => formatTickDate(value, ticks.unit),
    },
  }
}

/** Calendar-boundary tick timestamps covering the visible window. */
function calendarTicks(windowStart: number, windowEnd: number) {
  const duration = windowEnd - windowStart
  const stride = TICK_STRIDES.find(
    ({ unit, count }) => duration / (TICK_UNIT_MS[unit] * count) <= MAX_X_TICKS,
  ) ??
    TICK_STRIDES.at(-1) ?? { unit: 'year' as const, count: 1 }

  const floorToUnit: Record<TickUnit, (date: Date) => Date> = {
    hour: startOfHour,
    day: startOfDay,
    week: (date) => startOfWeek(date, { weekStartsOn: 1 }),
    month: startOfMonth,
    year: startOfYear,
  }
  const addUnits: Record<TickUnit, (date: Date, amount: number) => Date> = {
    hour: addHours,
    day: addDays,
    week: addWeeks,
    month: addMonths,
    year: addYears,
  }

  const values: number[] = []
  let cursor = floorToUnit[stride.unit](new Date(windowStart))
  while (cursor.getTime() < windowStart) {
    cursor = addUnits[stride.unit](cursor, stride.count)
  }
  while (cursor.getTime() <= windowEnd) {
    values.push(cursor.getTime())
    cursor = addUnits[stride.unit](cursor, stride.count)
  }
  return { values, unit: stride.unit }
}

function formatTickDate(value: number, unit: TickUnit) {
  const date = new Date(value)
  if (unit === 'hour') {
    const day = date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' })
    const time = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      hour12: false,
      minute: '2-digit',
    })
    return `${day}\n${time}`
  }

  if (unit === 'day' || unit === 'week') {
    return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' })
  }

  if (unit === 'month') {
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }

  return date.toLocaleDateString('en-US', { year: 'numeric' })
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
  const padded = maximum === 0 ? 1 / pricingScale(context.metric) : maximum * 1.04
  const approximateInterval = padded / 6
  const magnitude = 10 ** Math.floor(Math.log10(approximateInterval))
  const normalized = approximateInterval / magnitude
  const intervalMultiplier = normalized <= 1.5 ? 1 : normalized <= 3 ? 2 : normalized <= 7 ? 5 : 10
  const interval = intervalMultiplier * magnitude

  // Snap the ceiling up to a gridline so it can carry a label. Without this a
  // constant-price model draws as a line grazing the chart's top border with
  // nothing above it to anchor the eye. The epsilon absorbs float noise like
  // 1 / 0.2 === 5.000000000000001 stealing an entire extra interval.
  return { interval, max: Math.ceil(padded / interval - 1e-9) * interval }
}

function formatSliderDetailDate(value: number, includeYear: boolean) {
  return new Date(value).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    ...(includeYear ? { year: 'numeric' } : {}),
  })
}

function formatChartPrice(metric: PricingMetric, value: number, includeUnit: boolean) {
  const formatted = formatPricing(metric, value)
  if (formatted === null) {
    return '—'
  }

  return includeUnit && formatted.unit ? `${formatted.value}/${formatted.unit}` : formatted.value
}
