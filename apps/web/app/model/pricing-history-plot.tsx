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
import { useTheme } from 'next-themes'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import {
  createPricingHistoryChartOption,
  createZoomedAxesOption,
  FULL_HISTORY_WINDOW,
  ZOOM_ANIMATION_DURATION,
} from './pricing-history-chart-option'
import type { PricingSeries, ZoomContext, ZoomWindow } from './pricing-history-chart-option'
import { endpointColor } from './pricing-history-colors'
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

/**
 * React owns durable UI state (metric and visible endpoints), while ECharts
 * owns the high-frequency zoom interaction. Refs bridge those two lifecycles
 * without rerendering React for every pixel the slider moves.
 */
export function PricingHistoryPlot({
  history,
  metric,
}: {
  history: EndpointPricingHistory
  metric: PricingMetric
}) {
  const { resolvedTheme } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ECharts | null>(null)
  const zoomContextRef = useRef<ZoomContext | null>(null)
  const zoomWindowRef = useRef<ZoomWindow>(FULL_HISTORY_WINDOW)
  const zoomAnimationRef = useRef<number | null>(null)
  const historyBoundsKeyRef = useRef('')
  const [disabledEndpointUuids, setDisabledEndpointUuids] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const [isZoomed, setIsZoomed] = useState(false)

  const renderableSeries = history.series
    .map((series, colorIndex) => ({ series, colorIndex }))
    .filter(({ series }) => hasMetricHistory(series, metric))
  const visibleSeries = renderableSeries.filter(
    ({ series }) => !disabledEndpointUuids.has(series.endpointUuid),
  )

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

    chartRef.current?.dispatchAction({
      type: emphasized ? 'highlight' : 'downplay',
      // Availability gaps are separate chart series with the same provider
      // name, so targeting by name emphasizes every segment together.
      seriesName: providerId(series),
    })
  }

  const resetZoom = () => {
    const chart = chartRef.current
    if (chart === null) {
      return
    }

    cancelZoomAnimation(zoomAnimationRef)

    const initialWindow = zoomWindowRef.current
    if (isFullHistoryWindow(initialWindow)) {
      return
    }

    if (prefersReducedMotion()) {
      dispatchZoomWindow(chart, FULL_HISTORY_WINDOW)
      return
    }

    // ECharts does not interpolate a dataZoom dispatch for us. Driving the
    // percentage window frame-by-frame keeps reset smooth and interruptible.
    const startAnimation = (startedAt: number) => {
      const animate = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / ZOOM_ANIMATION_DURATION)
        const easedProgress = 1 - (1 - progress) ** 3

        dispatchZoomWindow(chart, {
          start:
            initialWindow.start + (FULL_HISTORY_WINDOW.start - initialWindow.start) * easedProgress,
          end: initialWindow.end + (FULL_HISTORY_WINDOW.end - initialWindow.end) * easedProgress,
        })

        zoomAnimationRef.current = progress < 1 ? requestAnimationFrame(animate) : null
      }

      animate(startedAt)
    }

    zoomAnimationRef.current = requestAnimationFrame(startAnimation)
  }

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
      setIsZoomed((current) => {
        const next = !isFullHistoryWindow(zoom)
        return current === next ? current : next
      })

      const context = zoomContextRef.current
      if (context !== null) {
        // Zoom events can arrive every animation frame. Patch only the axes;
        // rebuilding all line segments here would make the slider feel heavy.
        chart.setOption(createZoomedAxesOption(context, zoom), { lazyUpdate: true })
      }
    }

    chart.on('datazoom', handleDataZoom)
    chart.getZr().on('mousedown', handleDirectManipulation)
    chart.getZr().on('mousewheel', handleDirectManipulation)

    const observer = new ResizeObserver(() => {
      chart.resize()
    })
    observer.observe(container)

    return () => {
      cancelZoomAnimation(zoomAnimationRef)
      observer.disconnect()
      chart.off('datazoom', handleDataZoom)
      chart.getZr().off('mousedown', handleDirectManipulation)
      chart.getZr().off('mousewheel', handleDirectManipulation)
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (chart === null) {
      return
    }

    const historyBoundsKey = `${history.since}:${history.asOf}`
    if (historyBoundsKeyRef.current !== historyBoundsKey) {
      historyBoundsKeyRef.current = historyBoundsKey
      // Zoom is percentage-based, so carrying it into a differently bounded
      // history would silently point at a different period.
      zoomWindowRef.current = FULL_HISTORY_WINDOW
      setIsZoomed(false)
    }

    const renderedSeries = history.series.filter(
      (series) =>
        !disabledEndpointUuids.has(series.endpointUuid) && hasMetricHistory(series, metric),
    )
    const zoom = zoomWindowRef.current
    const context: ZoomContext = {
      since: history.since,
      asOf: history.asOf,
      series: renderedSeries,
      metric,
    }
    zoomContextRef.current = context

    // Endpoint selection, metric, history, and theme are low-frequency changes.
    // Replacing the option here also removes stale segment series cleanly.
    chart.setOption(
      createPricingHistoryChartOption({
        allSeries: history.series,
        animateUpdates: !prefersReducedMotion(),
        context,
        isDark: true,
        zoom,
      }),
      { lazyUpdate: false, notMerge: true },
    )
  }, [disabledEndpointUuids, history, metric, resolvedTheme])

  return (
    <div className="space-y-3">
      <div className="relative min-h-[390px] w-full overflow-hidden rounded-md bg-muted/15">
        <div
          aria-label={`${metric === 'text_input' ? 'Input' : 'Output'} pricing history chart`}
          className={cn(
            'h-[390px] w-full transition-opacity duration-150',
            visibleSeries.length === 0 && 'pointer-events-none opacity-0',
          )}
          data-testid="pricing-history-plot"
          ref={containerRef}
        />
        {visibleSeries.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-muted-foreground">
            Select an endpoint below to render its pricing history.
          </div>
        ) : null}
      </div>
      <div className="flex min-h-10 items-center justify-between gap-3">
        <p aria-live="polite" className="text-muted-foreground tabular-nums">
          {visibleSeries.length} of {renderableSeries.length} endpoints shown
        </p>
        <div className="flex items-center gap-1">
          <Button
            className="active:scale-[0.96]"
            disabled={!isZoomed}
            onClick={resetZoom}
            variant="ghost"
          >
            Reset zoom
          </Button>
          <Button className="active:scale-[0.96]" onClick={toggleAllEndpoints} variant="ghost">
            {visibleSeries.length === renderableSeries.length ? 'Hide all' : 'Show all'}
          </Button>
        </div>
      </div>
      <ul className="flex flex-wrap gap-x-2" aria-label="Endpoints">
        {renderableSeries.map(({ series, colorIndex }) => (
          <li className="min-w-0" key={series.endpointUuid}>
            <button
              aria-label={`${disabledEndpointUuids.has(series.endpointUuid) ? 'Show' : 'Hide'} ${providerId(series)} endpoint`}
              aria-pressed={!disabledEndpointUuids.has(series.endpointUuid)}
              className={cn(
                'flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-muted-foreground transition-[background-color,opacity,scale] outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/30 active:scale-[0.96]',
                disabledEndpointUuids.has(series.endpointUuid) && 'opacity-40',
              )}
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
                style={{ backgroundColor: endpointColor(colorIndex, history.series.length) }}
              />
              <span className="max-w-52 truncate" title={providerId(series)}>
                {providerId(series)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function hasMetricHistory(series: PricingSeries, metric: PricingMetric) {
  return series.points.some((point) => point.available && point.pricing[metric] !== undefined)
}

function providerId(series: PricingSeries) {
  return series.provider.tag_slug
}

function dispatchZoomWindow(chart: ECharts, zoom: ZoomWindow) {
  chart.dispatchAction({ type: 'dataZoom', start: zoom.start, end: zoom.end })
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

function isFullHistoryWindow(zoom: ZoomWindow) {
  return (
    Math.abs(zoom.start - FULL_HISTORY_WINDOW.start) < 0.01 &&
    Math.abs(zoom.end - FULL_HISTORY_WINDOW.end) < 0.01
  )
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
