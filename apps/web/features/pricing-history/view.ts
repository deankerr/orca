import { priceMeters } from '@/lib/backend'

import { DAY, dailyTrace, pricingHistoryTraces } from './data'
import type { PricingHistory } from './data'

const METERS = (
  [
    { label: 'Input', value: 'prompt' },
    { label: 'Output', value: 'completion' },
    { label: 'Cache read', value: 'input_cache_read' },
    { label: 'Cache write', value: 'input_cache_write' },
    { label: 'Cache write · 1h', value: 'input_cache_write_1h' },
    { label: 'Audio input', value: 'audio' },
    { label: 'Audio cache', value: 'input_audio_cache' },
    { label: 'Image input', value: 'image' },
    { label: 'Image output', value: 'image_output' },
  ] satisfies { value: keyof typeof priceMeters; label: string }[]
).map(({ value, label }) => ({
  label,
  scale: 10 ** priceMeters[value].scale,
  unit: `$/${priceMeters[value].unit}`,
  value,
}))

export type Meter = (typeof METERS)[number]

export function pricingHistoryView(
  pricingHistory: PricingHistory,
  {
    requestedMeter,
    window,
    preset,
    hidden,
    hoverAt,
  }: {
    requestedMeter: string
    window: [number, number] | null
    preset: string
    hidden: Set<string>
    hoverAt: number | null
  },
) {
  const tracesByMeter = new Map(
    METERS.map(({ value }) => [value, pricingHistoryTraces(pricingHistory, value)]),
  )

  const available = METERS.filter(({ value }) => (tracesByMeter.get(value)?.length ?? 0) > 0)

  const meter = available.find(({ value }) => value === requestedMeter) ?? available[0] ?? METERS[0]
  const meters = available.length > 0 ? available : [meter]

  let since = pricingHistory.asOf

  for (const endpoint of pricingHistory.endpoints) {
    for (const observation of endpoint.observations) {
      if (observation.model_id === pricingHistory.modelId) {
        since = Math.min(since, Date.parse(observation.scan_at))
      }
    }
  }

  const range: [number, number] =
    preset === '' && window !== null
      ? window
      : [
          preset === 'all'
            ? since
            : Math.max(since, pricingHistory.asOf - Number(preset || '30') * DAY),
          pricingHistory.asOf,
        ]

  const daily = range[1] - range[0] > 7 * DAY + 1
  const exact = tracesByMeter.get(meter.value) ?? []

  const exactScaled = exact.map((trace) => ({
    ...trace,
    samples: trace.samples.map(([at, price]): [number, number] => [at, price * meter.scale]),
  }))

  const traces = daily
    ? exactScaled.map((trace) => dailyTrace(trace, pricingHistory.asOf))
    : exactScaled

  const tagSet = new Set<string>()

  for (const trace of traces) {
    if (trace.end >= range[0] && trace.start <= range[1]) {
      tagSet.add(trace.tag)
    }
  }

  const tags = [...tagSet].toSorted()
  const shownCount = tags.filter((tag) => !hidden.has(tag)).length
  const allShown = tags.length > 0 && shownCount === tags.length
  const visible = traces.filter((trace) => tagSet.has(trace.tag) && !hidden.has(trace.tag))
  const at = Math.max(range[0], Math.min(range[1], hoverAt ?? range[1]))

  return {
    allShown,
    at,
    available,
    exactScaled,
    meter,
    meters,
    range,
    shownCount,
    since,
    tags,
    visible,
  }
}
