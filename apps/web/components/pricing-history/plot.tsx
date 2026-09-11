'use client'

import { formatPricing } from '@orca/backend/convex/shared/pricing'
import { LineChart } from 'echarts/charts'
import { AxisPointerComponent, DataZoomComponent, GridComponent } from 'echarts/components'
import { init, use as register } from 'echarts/core'
import type { ECharts } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { useEffect, useRef } from 'react'

import { providerSrgbColor } from './colors'
import { sampleAt } from './data'
import type { Trace } from './data'

register([LineChart, AxisPointerComponent, DataZoomComponent, GridComponent, CanvasRenderer])

// Opposing outer paths preserve a 44px hit area around the visible handle.
const NAVIGATOR_HANDLE =
  'path://M-22-22H22V22H-22ZM-22-22V22H22V-22H-22ZM-3-16Q-5-16-5-14V14Q-5 16-3 16H3Q5 16 5 14V-14Q5-16 3-16Z'

function applyInspectedPointer(instance: ECharts, at: number | null, asOf: number) {
  instance.setOption({
    xAxis: {
      axisPointer: {
        triggerEmphasis: false,
        show: at !== null,
        label: { show: false },
        value: at ?? asOf,
        status: at === null ? 'hide' : 'show',
        lineStyle: { color: '#a1a1aa', type: 'dashed' },
      },
    },
  })
}

export function PricingHistoryPlot({
  traces,
  since,
  asOf,
  range,
  emphasis,
  inspectedAt,
  onRange,
  onInspect,
  onEmphasis,
}: {
  traces: Trace[]
  since: number
  asOf: number
  range: [number, number]
  emphasis: string | null
  inspectedAt: number | null
  onRange: (range: [number, number]) => void
  onInspect: (at: number | null) => void
  onEmphasis: (tag: string | null) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const chart = useRef<ECharts | null>(null)
  const frame = useRef<DOMRect | null>(null)
  const callbacks = useRef({ onRange, onInspect, onEmphasis, since, asOf })

  useEffect(() => {
    callbacks.current = { onRange, onInspect, onEmphasis, since, asOf }
  })

  useEffect(() => {
    const node = container.current

    if (!node) {
      return undefined
    }

    const instance = init(node, undefined, { renderer: 'canvas' })
    chart.current = instance

    const measure = () => {
      frame.current = node.getBoundingClientRect()
    }

    measure()

    const resize = new ResizeObserver(() => {
      measure()
      instance.resize()
    })

    resize.observe(node)

    instance.on('datazoom', (payload: unknown) => {
      const zoom = zoomEvent(payload)

      if (zoom === null) {
        return
      }

      const bounds = callbacks.current

      callbacks.current.onRange([
        bounds.since + ((bounds.asOf - bounds.since) * zoom.start) / 100,
        bounds.since + ((bounds.asOf - bounds.since) * zoom.end) / 100,
      ])
    })

    instance.on('mouseover', (event: unknown) => {
      if (
        typeof event === 'object' &&
        event !== null &&
        'seriesName' in event &&
        typeof event.seriesName === 'string'
      ) {
        callbacks.current.onEmphasis(event.seriesName)
      }
    })

    instance.on('mouseout', () => {
      callbacks.current.onEmphasis(null)
    })

    const inspect = (event: MouseEvent) => {
      const rect = frame.current

      if (rect === null) {
        return
      }

      const pixel = [event.clientX - rect.left, event.clientY - rect.top]

      if (instance.containPixel('grid', pixel)) {
        const value = instance.convertFromPixel({ gridIndex: 0 }, pixel)
        const [at] = value

        if (Number.isFinite(at)) {
          applyInspectedPointer(instance, at, callbacks.current.asOf)
          callbacks.current.onInspect(at)
        }
      } else {
        applyInspectedPointer(instance, null, callbacks.current.asOf)
        callbacks.current.onInspect(null)
      }
    }

    const leave = () => {
      applyInspectedPointer(instance, null, callbacks.current.asOf)
      callbacks.current.onInspect(null)
    }

    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) {
        event.stopPropagation()
      }
    }

    node.addEventListener('mousemove', inspect)
    node.addEventListener('mouseleave', leave)
    node.addEventListener('wheel', wheel, { capture: true, passive: true })

    return () => {
      resize.disconnect()
      node.removeEventListener('mousemove', inspect)
      node.removeEventListener('mouseleave', leave)
      node.removeEventListener('wheel', wheel, { capture: true })
      instance.dispose()
      chart.current = null
    }
  }, [])

  useEffect(() => {
    const maximum = Math.max(
      0,
      ...traces.flatMap((trace) => {
        if (trace.end < range[0] || trace.start > range[1]) {
          return []
        }

        return [
          sampleAt(trace.samples, range[0]) ?? 0,
          ...trace.samples
            .filter(([at]) => at >= range[0] && at <= range[1])
            .map(([, price]) => price),
        ]
      }),
    )

    const span = Math.max(1, asOf - since)

    chart.current?.setOption(
      {
        animation: true,
        animationDuration: 0,
        animationDurationUpdate: 0,
        stateAnimation: {
          duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 150,
          easing: 'cubicOut',
        },
        grid: { left: 58, right: 16, top: 20, bottom: 85 },
        xAxis: {
          type: 'time',
          min: since,
          max: asOf,
          axisLabel: { color: '#a1a1aa', hideOverlap: true },
          axisLine: { lineStyle: { color: '#3f3f46' } },
        },
        yAxis: {
          type: 'value',
          min: 0,
          max: maximum > 0 ? niceCeiling(maximum * 1.08) : 1,
          axisLabel: {
            color: '#a1a1aa',
            formatter: (price: number) => formatPricing('text_input', price / 1e6)?.value ?? '—',
          },
          splitLine: { lineStyle: { color: '#27272a' } },
        },
        dataZoom: [
          {
            type: 'inside',
            start: ((range[0] - since) / span) * 100,
            end: ((range[1] - since) / span) * 100,
            filterMode: 'none',
            zoomOnMouseWheel: 'ctrl',
            moveOnMouseWheel: false,
            minValueSpan: Math.min(60_000, span),
          },
          {
            type: 'slider',
            realtime: true,
            throttle: 50,
            start: ((range[0] - since) / span) * 100,
            end: ((range[1] - since) / span) * 100,
            filterMode: 'none',
            bottom: 12,
            left: 16,
            right: 16,
            height: 24,
            brushSelect: false,
            moveHandleSize: 0,
            handleIcon: NAVIGATOR_HANDLE,
            handleSize: 44,
            handleLabel: { show: false },
            handleStyle: {
              color: '#e5e5e5',
              borderWidth: 0,
              shadowBlur: 4,
              shadowColor: 'rgba(0,0,0,0.5)',
            },
            minValueSpan: Math.min(60_000, span),
            showDetail: false,
            showDataShadow: false,
            borderColor: 'rgba(255,255,255,0.1)',
            borderRadius: 4,
            backgroundColor: '#0a0a0a',
            fillerColor: '#262626',
            textStyle: { color: '#a1a1aa' },
          },
        ],
        series: traces.map((trace) => {
          const color = providerSrgbColor(trace.tag)
          return {
            id: trace.id,
            name: trace.tag,
            type: 'line',
            triggerEvent: 'line',
            step: 'end',
            showSymbol: false,
            data: [...trace.samples, [trace.end, trace.samples.at(-1)?.[1] ?? null]],
            lineStyle: { width: 1.5, color },
            itemStyle: { color },
            emphasis: { focus: 'series', lineStyle: { width: 3 } },
          }
        }),
      },
      { replaceMerge: ['series'] },
    )
  }, [traces, since, asOf, range])

  useEffect(() => {
    chart.current?.dispatchAction({ type: 'downplay' })

    if (emphasis !== null) {
      chart.current?.dispatchAction({ type: 'highlight', seriesName: emphasis })
    }
  }, [emphasis, traces, range])

  useEffect(() => {
    if (chart.current) {
      applyInspectedPointer(chart.current, inspectedAt, asOf)
    }
  }, [inspectedAt, asOf, traces, range])

  return (
    <div
      ref={container}
      className="h-full w-full rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- The canvas itself is the time inspector; an input would introduce a second visible control.
      role="slider"
      aria-valuemin={range[0]}
      aria-valuemax={range[1]}
      aria-valuenow={inspectedAt ?? range[1]}
      aria-valuetext={new Date(inspectedAt ?? range[1]).toLocaleString()}
      tabIndex={0}
      aria-label="Pricing history chart. Use arrow keys to inspect prices, Home for the start and End for the latest in view."
      onKeyDown={(event) => {
        const step = (range[1] - range[0]) / 100
        const current = inspectedAt ?? range[1]

        const next = {
          ArrowLeft: current - step,
          ArrowRight: current + step,
          Home: range[0],
          End: range[1],
        }[event.key]

        if (next !== undefined) {
          event.preventDefault()
          const at = Math.max(range[0], Math.min(range[1], next))

          if (chart.current) {
            applyInspectedPointer(chart.current, at, asOf)
          }

          onInspect(at)
        }
      }}
    />
  )
}

function zoomEvent(value: unknown): { start: number; end: number } | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  if ('batch' in value && Array.isArray(value.batch)) {
    return zoomEvent(value.batch[0])
  }

  if (
    'start' in value &&
    typeof value.start === 'number' &&
    'end' in value &&
    typeof value.end === 'number' &&
    Number.isFinite(value.start) &&
    Number.isFinite(value.end) &&
    value.start >= 0 &&
    value.end <= 100 &&
    value.start <= value.end
  ) {
    return { start: value.start, end: value.end }
  }

  return null
}

function niceCeiling(value: number) {
  const magnitude = 10 ** Math.floor(Math.log10(value / 5))
  const step = Math.ceil(value / 5 / magnitude) * magnitude
  return Math.ceil(value / step) * step
}
