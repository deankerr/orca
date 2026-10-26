'use client'

import { LineChart } from 'echarts/charts'
import { AxisPointerComponent, DataZoomComponent, GridComponent } from 'echarts/components'
import { init, use as register } from 'echarts/core'
import type { ECharts } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { useEffect, useRef } from 'react'
import { z } from 'zod'

import { formatPrice } from '@/lib/backend'

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
        label: { show: false },
        lineStyle: { color: '#a1a1aa', type: 'dashed' },
        show: at !== null,
        status: at === null ? 'hide' : 'show',
        triggerEmphasis: false,
        value: at ?? asOf,
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
  const callbacks = useRef({ asOf, onEmphasis, onInspect, onRange, since })

  useEffect(() => {
    callbacks.current = { asOf, onEmphasis, onInspect, onRange, since }
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

    // ECharts leaves action payloads untyped.
    instance.on('datazoom', (payload) => {
      const zoom = DataZoom.safeParse(payload)

      if (!zoom.success) {
        return
      }

      const bounds = callbacks.current

      callbacks.current.onRange([
        bounds.since + ((bounds.asOf - bounds.since) * zoom.data.start) / 100,
        bounds.since + ((bounds.asOf - bounds.since) * zoom.data.end) / 100,
      ])
    })

    instance.on('mouseover', (event) => {
      if (event.seriesName !== undefined) {
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
    let maximum = 0

    for (const trace of traces) {
      if (trace.end < range[0] || trace.start > range[1]) {
        continue
      }

      maximum = Math.max(maximum, sampleAt(trace.samples, range[0]) ?? 0)

      for (const [at, price] of trace.samples) {
        if (at >= range[0] && at <= range[1]) {
          maximum = Math.max(maximum, price)
        }
      }
    }

    const span = Math.max(1, asOf - since)

    chart.current?.setOption(
      {
        animation: true,
        animationDuration: 0,
        animationDurationUpdate: 0,
        dataZoom: [
          {
            end: ((range[1] - since) / span) * 100,
            filterMode: 'none',
            minValueSpan: Math.min(60_000, span),
            moveOnMouseWheel: false,
            start: ((range[0] - since) / span) * 100,
            type: 'inside',
            zoomOnMouseWheel: 'ctrl',
          },
          {
            backgroundColor: '#0a0a0a',
            borderColor: 'rgba(255,255,255,0.1)',
            borderRadius: 4,
            bottom: 12,
            brushSelect: false,
            end: ((range[1] - since) / span) * 100,
            fillerColor: '#262626',
            filterMode: 'none',
            handleIcon: NAVIGATOR_HANDLE,
            handleLabel: { show: false },
            handleSize: 44,
            handleStyle: {
              borderWidth: 0,
              color: '#e5e5e5',
              shadowBlur: 4,
              shadowColor: 'rgba(0,0,0,0.5)',
            },
            height: 24,
            left: 16,
            minValueSpan: Math.min(60_000, span),
            moveHandleSize: 0,
            realtime: true,
            right: 16,
            showDataShadow: false,
            showDetail: false,
            start: ((range[0] - since) / span) * 100,
            textStyle: { color: '#a1a1aa' },
            throttle: 50,
            type: 'slider',
          },
        ],
        grid: { bottom: 85, left: 58, right: 16, top: 20 },
        series: traces.map((trace) => {
          const color = providerSrgbColor(trace.tag)

          return {
            data: [...trace.samples, [trace.end, trace.samples.at(-1)?.[1] ?? null]],
            emphasis: { focus: 'series', lineStyle: { width: 3 } },
            id: trace.id,
            itemStyle: { color },
            lineStyle: { color, width: 1.5 },
            name: trace.tag,
            showSymbol: false,
            step: 'end',
            triggerEvent: 'line',
            type: 'line',
          }
        }),
        stateAnimation: {
          duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 150,
          easing: 'cubicOut',
        },
        xAxis: {
          axisLabel: { color: '#a1a1aa', hideOverlap: true },
          axisLine: { lineStyle: { color: '#3f3f46' } },
          max: asOf,
          min: since,
          type: 'time',
        },
        yAxis: {
          axisLabel: {
            color: '#a1a1aa',
            formatter: (price: number) => formatPrice(price) ?? '—',
          },
          max: maximum > 0 ? niceCeiling(maximum * 1.08) : 1,
          min: 0,
          splitLine: { lineStyle: { color: '#27272a' } },
          type: 'value',
        },
      },
      { replaceMerge: ['series'] },
    )
  }, [traces, since, asOf, range])

  useEffect(() => {
    chart.current?.dispatchAction({ type: 'downplay' })

    if (emphasis !== null) {
      chart.current?.dispatchAction({ seriesName: emphasis, type: 'highlight' })
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Reapply highlighting after trace or range changes update the chart's series.
  }, [emphasis, traces, range])

  useEffect(() => {
    if (chart.current) {
      applyInspectedPointer(chart.current, inspectedAt, asOf)
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Restore the inspection pointer after trace or range changes update the chart.
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
          End: range[1],
          Home: range[0],
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

/** Zoom window as percentages of the full range. */
const ZoomRange = z
  .object({ end: z.number().max(100), start: z.number().min(0) })
  .refine(({ end, start }) => start <= end)

/** Slider drags report the range directly; inside zooming reports a batch. */
const DataZoom = z.union([
  ZoomRange,
  z.object({ batch: z.tuple([ZoomRange], z.unknown()) }).transform(({ batch: [range] }) => range),
])

function niceCeiling(value: number) {
  const magnitude = 10 ** Math.floor(Math.log10(value / 5))
  const step = Math.ceil(value / 5 / magnitude) * magnitude

  return Math.ceil(value / step) * step
}
