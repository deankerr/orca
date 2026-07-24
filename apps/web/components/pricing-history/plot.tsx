'use client'

import { LineChart } from 'echarts/charts'
import {
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  TooltipComponent,
} from 'echarts/components'
import { init, use as registerEChartsModules } from 'echarts/core'
import type { ECharts } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

import {
  createPricingHistoryChartOption,
  createZoomedAxesOption,
  FULL_HISTORY_WINDOW,
  ZOOM_ANIMATION_DURATION,
  zoomWindowsEqual,
} from './chart-option'
import type { ZoomContext, ZoomWindow } from './chart-option'
import { pricingMetricMetadata } from './pricing-fields'
import { hasMetricHistory } from './series'
import type { EndpointPricingHistory, PricingMetric } from './types'

// The core ECharts build stays out of the client bundle unless each required
// chart, component, and renderer is registered explicitly.
registerEChartsModules([
  LineChart,
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  TooltipComponent,
  CanvasRenderer,
])

export type PricingHistoryPlotHandle = {
  /** Animates the visible window to the given percentage range. */
  zoomTo: (target: ZoomWindow) => void
  /** Emphasizes every chart segment belonging to the named provider series. */
  setSeriesEmphasis: (seriesName: string, emphasized: boolean) => void
}

/**
 * Pure canvas: the card owns all durable UI state (metric, selected providers)
 * and the surrounding layout, while this component owns the ECharts instance
 * and the high-frequency zoom interaction. The handle ref bridges those two
 * lifecycles without rerendering React for every pixel the slider moves.
 */
export function PricingHistoryPlot({
  handleRef,
  history,
  metric,
  onAxisHoverChange,
  onSeriesHoverChange,
  onZoomWindowChange,
  selectedProviderIds,
}: {
  handleRef: RefObject<PricingHistoryPlotHandle | null>
  history: EndpointPricingHistory
  metric: PricingMetric
  onAxisHoverChange: (timestamp: number | null) => void
  onSeriesHoverChange: (seriesName: string | null) => void
  onZoomWindowChange: (window: ZoomWindow) => void
  selectedProviderIds: ReadonlySet<string>
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ECharts | null>(null)
  const zoomContextRef = useRef<ZoomContext | null>(null)
  const zoomWindowRef = useRef<ZoomWindow>(FULL_HISTORY_WINDOW)
  const zoomAnimationRef = useRef<number | null>(null)
  const historyBoundsRef = useRef<HistoryBounds | null>(null)
  // Chart events fire from listeners registered once at mount; the ref keeps
  // them calling the latest callbacks without re-subscribing.
  const callbacksRef = useRef({ onAxisHoverChange, onSeriesHoverChange, onZoomWindowChange })

  useEffect(() => {
    callbacksRef.current = { onAxisHoverChange, onSeriesHoverChange, onZoomWindowChange }
  })

  const zoomTo = (target: ZoomWindow) => {
    const chart = chartRef.current
    if (chart === null) {
      return
    }

    cancelZoomAnimation(zoomAnimationRef)

    const initialWindow = zoomWindowRef.current
    if (zoomWindowsEqual(initialWindow, target)) {
      return
    }

    if (prefersReducedMotion()) {
      dispatchZoomWindow(chart, target)
      return
    }

    // ECharts does not interpolate a dataZoom dispatch for us. Driving the
    // percentage window frame-by-frame keeps the transition smooth and interruptible.
    const startAnimation = (startedAt: number) => {
      const animate = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / ZOOM_ANIMATION_DURATION)
        const easedProgress = 1 - (1 - progress) ** 3

        dispatchZoomWindow(chart, {
          start: initialWindow.start + (target.start - initialWindow.start) * easedProgress,
          end: initialWindow.end + (target.end - initialWindow.end) * easedProgress,
        })

        zoomAnimationRef.current = progress < 1 ? requestAnimationFrame(animate) : null
      }

      animate(startedAt)
    }

    zoomAnimationRef.current = requestAnimationFrame(startAnimation)
  }

  const setSeriesEmphasis = (seriesName: string, emphasized: boolean) => {
    chartRef.current?.dispatchAction({
      type: emphasized ? 'highlight' : 'downplay',
      // Availability gaps are separate chart series with the same provider
      // name, so targeting by name emphasizes every segment together.
      seriesName,
    })
  }

  // Republish on every render so the handle always closes over fresh state.
  useEffect(() => {
    handleRef.current = { zoomTo, setSeriesEmphasis }
    return () => {
      handleRef.current = null
    }
  })

  useEffect(() => {
    const container = containerRef.current
    if (container === null) {
      return undefined
    }

    // One imperative chart instance lives for the lifetime of its DOM node.
    // Later React updates replace its option rather than recreating the canvas.
    const chart = init(container, undefined, { renderer: 'canvas' })
    chartRef.current = chart

    const handleDirectManipulation = () => {
      // A pointer or wheel gesture always wins over the reset animation.
      cancelZoomAnimation(zoomAnimationRef)
    }

    const handleDataZoom = (event: unknown) => {
      const zoom = zoomWindowFromEvent(event, zoomWindowRef.current)
      zoomWindowRef.current = zoom
      callbacksRef.current.onZoomWindowChange(zoom)

      const context = zoomContextRef.current
      if (context !== null) {
        // Zoom events can arrive every animation frame. Patch only the axes;
        // rebuilding all line segments here would make the slider feel heavy.
        chart.setOption(createZoomedAxesOption(context, zoom), { lazyUpdate: true })
      }
    }

    const handleSeriesMouseOver = (event: unknown) => {
      const seriesName = seriesNameFromEvent(event)
      if (seriesName !== null) {
        callbacksRef.current.onSeriesHoverChange(seriesName)
      }
    }

    const handleSeriesMouseOut = (event: unknown) => {
      if (seriesNameFromEvent(event) !== null) {
        callbacksRef.current.onSeriesHoverChange(null)
      }
    }

    // The axis pointer snaps to change-event timestamps, so the value only
    // changes when the pointer crosses an event; identical updates are
    // no-op setStates for the card.
    const handleUpdateAxisPointer = (event: unknown) => {
      const timestamp = axisPointerTimestamp(event)
      if (timestamp !== null) {
        callbacksRef.current.onAxisHoverChange(timestamp)
      }
    }

    const handleGlobalOut = () => {
      callbacksRef.current.onAxisHoverChange(null)
    }

    // zrender preventDefaults every wheel event over the canvas, even though
    // zooming requires ctrl - trapping page scroll whenever the cursor lands
    // on the chart. Divert plain wheel events before zrender sees them so the
    // page keeps scrolling; ctrl+wheel (and trackpad pinch) still zooms.
    const handleWheelCapture = (event: WheelEvent) => {
      if (!event.ctrlKey) {
        event.stopPropagation()
      }
    }
    container.addEventListener('wheel', handleWheelCapture, { capture: true })

    chart.on('datazoom', handleDataZoom)
    chart.on('mouseover', handleSeriesMouseOver)
    chart.on('mouseout', handleSeriesMouseOut)
    chart.on('updateAxisPointer', handleUpdateAxisPointer)
    chart.getZr().on('mousedown', handleDirectManipulation)
    chart.getZr().on('mousewheel', handleDirectManipulation)
    chart.getZr().on('globalout', handleGlobalOut)

    const observer = new ResizeObserver(() => {
      chart.resize()
    })
    observer.observe(container)

    return () => {
      cancelZoomAnimation(zoomAnimationRef)
      observer.disconnect()
      container.removeEventListener('wheel', handleWheelCapture, { capture: true })
      chart.off('datazoom', handleDataZoom)
      chart.off('mouseover', handleSeriesMouseOver)
      chart.off('mouseout', handleSeriesMouseOut)
      chart.off('updateAxisPointer', handleUpdateAxisPointer)
      chart.getZr().off('mousedown', handleDirectManipulation)
      chart.getZr().off('mousewheel', handleDirectManipulation)
      chart.getZr().off('globalout', handleGlobalOut)
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (chart === null) {
      return
    }

    const previousBounds = historyBoundsRef.current
    historyBoundsRef.current = { since: history.since, asOf: history.asOf }
    if (
      previousBounds !== null &&
      (previousBounds.since !== history.since || previousBounds.asOf !== history.asOf)
    ) {
      // Zoom is percentage-based, so a fresh snapshot extending the bounds
      // would silently shift the window onto different dates. Re-express it
      // against the new bounds so the user keeps looking at the same period.
      const rescaled = rescaleZoomWindow(zoomWindowRef.current, previousBounds, {
        since: history.since,
        asOf: history.asOf,
      })
      zoomWindowRef.current = rescaled
      callbacksRef.current.onZoomWindowChange(rescaled)
    }

    const renderedSeries = history.series.filter(
      (series) =>
        selectedProviderIds.has(series.provider.tag_slug) && hasMetricHistory(series, metric),
    )
    const zoom = zoomWindowRef.current
    const context: ZoomContext = {
      since: history.since,
      asOf: history.asOf,
      series: renderedSeries,
      metric,
    }
    zoomContextRef.current = context

    // Provider selection, metric, and history are low-frequency changes.
    // Replacing the option here also removes stale segment series cleanly.
    chart.setOption(
      createPricingHistoryChartOption({
        animateUpdates: !prefersReducedMotion(),
        context,
        zoom,
      }),
      { lazyUpdate: false, notMerge: true },
    )
  }, [history, metric, selectedProviderIds])

  return (
    <div
      aria-label={`${pricingMetricMetadata(metric).label} pricing history chart`}
      className="h-full w-full"
      data-testid="pricing-history-plot"
      ref={containerRef}
    />
  )
}

function dispatchZoomWindow(chart: ECharts, zoom: ZoomWindow) {
  chart.dispatchAction({ type: 'dataZoom', start: zoom.start, end: zoom.end })
}

type HistoryBounds = { since: number; asOf: number }

/**
 * Re-expresses a percentage window against new history bounds so it covers
 * the same dates. A window touching the live edge stays pinned to it, which
 * keeps "most recent" views tracking the latest data as snapshots arrive.
 */
function rescaleZoomWindow(zoom: ZoomWindow, from: HistoryBounds, to: HistoryBounds): ZoomWindow {
  const toSpan = to.asOf - to.since
  if (toSpan <= 0) {
    return FULL_HISTORY_WINDOW
  }

  const fromSpan = from.asOf - from.since
  const startAt = from.since + (fromSpan * zoom.start) / 100
  const endAt = from.since + (fromSpan * zoom.end) / 100
  const toPercent = (at: number) => Math.min(100, Math.max(0, ((at - to.since) / toSpan) * 100))

  const end = zoom.end >= 99.99 ? 100 : toPercent(endAt)
  return { start: Math.min(toPercent(startAt), end), end }
}

/** Extracts the hovered X-axis timestamp from an updateAxisPointer event. */
function axisPointerTimestamp(event: unknown): number | null {
  if (typeof event !== 'object' || event === null) {
    return null
  }

  const { axesInfo } = event as { axesInfo?: unknown }
  if (!Array.isArray(axesInfo)) {
    return null
  }

  for (const axis of axesInfo as unknown[]) {
    if (typeof axis !== 'object' || axis === null) {
      continue
    }
    const { value } = axis as { value?: unknown }
    if (typeof value === 'number') {
      return value
    }
  }
  return null
}

/** Extracts the provider series name from a chart mouse event, if it has one. */
function seriesNameFromEvent(event: unknown): string | null {
  if (typeof event !== 'object' || event === null) {
    return null
  }

  const candidate = event as { componentType?: unknown; seriesName?: unknown }
  return candidate.componentType === 'series' && typeof candidate.seriesName === 'string'
    ? candidate.seriesName
    : null
}

function cancelZoomAnimation(animationRef: { current: number | null }) {
  if (animationRef.current === null) {
    return
  }

  cancelAnimationFrame(animationRef.current)
  animationRef.current = null
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** ECharts uses either a direct payload or a `batch` payload depending on how zoom was initiated. */
function zoomWindowFromEvent(event: unknown, current: ZoomWindow): ZoomWindow {
  if (!isDataZoomEvent(event)) {
    return current
  }

  const [batch] = event.batch ?? []

  return {
    start:
      typeof batch?.start === 'number'
        ? batch.start
        : typeof event.start === 'number'
          ? event.start
          : current.start,
    end:
      typeof batch?.end === 'number'
        ? batch.end
        : typeof event.end === 'number'
          ? event.end
          : current.end,
  }
}

function isDataZoomEvent(
  value: unknown,
): value is Partial<ZoomWindow> & { batch?: Partial<ZoomWindow>[] } {
  if (!isZoomWindowValue(value)) {
    return false
  }

  return (
    !('batch' in value) ||
    value.batch === undefined ||
    (Array.isArray(value.batch) && value.batch.every(isZoomWindowValue))
  )
}

function isZoomWindowValue(value: unknown): value is Partial<ZoomWindow> {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  return (
    (!('start' in value) || value.start === undefined || typeof value.start === 'number') &&
    (!('end' in value) || value.end === undefined || typeof value.end === 'number')
  )
}
