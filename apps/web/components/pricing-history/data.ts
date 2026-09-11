import type { api } from '@orca/backend/convex/_generated/api'
import type { FunctionReturnType } from 'convex/server'

export type PricingHistory = FunctionReturnType<typeof api.v3.public.pricingHistory.get>
export const DAY = 86_400_000
export type Sample = [at: number, price: number]
export type Trace = {
  id: string
  tag: string
  start: number
  end: number
  samples: Sample[]
  current: boolean
}

/** Listed, positively metered spans. Never carry a quote across a listing gap. */
export function pricingHistoryTraces(pricingHistory: PricingHistory, meter: string): Trace[] {
  const traces: Trace[] = []

  for (const endpoint of pricingHistory.endpoints) {
    let trace: Trace | undefined
    let listed = false
    const listings = new Map(endpoint.listings.map((row) => [Date.parse(row.scan_at), row.state]))
    const prices = new Map(endpoint.prices.map((row) => [Date.parse(row.scan_at), row]))
    const times = [...new Set([...listings.keys(), ...prices.keys()])].toSorted((a, b) => a - b)

    for (const at of times) {
      const listing = listings.get(at)

      if (listing !== undefined) {
        if (trace) {
          trace.end = at
          trace.current = false
          trace = undefined
        }
        listed = listing === 'listed'
      }

      const row = prices.get(at)
      if (!listed || !row) {
        continue
      }

      const value = Number(row.meters[meter])
      if (!Number.isFinite(value) || value <= 0) {
        if (trace) {
          trace.end = at
          trace.current = false
          trace = undefined
        }
        continue
      }

      if (!trace) {
        trace = {
          id: `${endpoint.id}:${at}`,
          tag: endpoint.tag,
          start: at,
          end: pricingHistory.asOf,
          samples: [],
          current: true,
        }
        traces.push(trace)
      }
      if (trace.samples.at(-1)?.[1] !== value) {
        trace.samples.push([at, value])
      }
    }
  }

  return traces
}

export function sampleAt(samples: Sample[], at: number): number | undefined {
  let value: number | undefined
  for (const sample of samples) {
    if (sample[0] > at) {
      break
    }
    const [, price] = sample
    value = price
  }
  return value
}

/** Daily UTC boundary samples, retaining span boundaries and the latest observed quote. */
export function dailyTrace(trace: Trace, asOf: number): Trace {
  const [first] = trace.samples
  if (trace.samples.length === 0) {
    return trace
  }
  const samples: Sample[] = [first]
  let current = first
  let index = 0
  for (let at = (Math.floor(trace.start / DAY) + 1) * DAY; at < trace.end; at += DAY) {
    let next = trace.samples[index + 1]
    while (index + 1 < trace.samples.length && next[0] <= at) {
      current = next
      index += 1
      next = trace.samples[index + 1]
    }
    samples.push([at, current[1]])
  }
  const latest = trace.samples.at(-1)
  if (trace.current && trace.end === asOf && latest) {
    samples.push([asOf, latest[1]])
  }
  return { ...trace, samples }
}

/** Multiple distinct quotes for a rare shared tag stay visible as a range in the board. */
export function tagPrices(traces: Trace[], tag: string, at: number, asOf: number) {
  return [
    ...new Set(
      traces
        .filter(
          (trace) =>
            trace.tag === tag &&
            trace.start <= at &&
            (at < trace.end || (trace.current && at === asOf && trace.end === asOf)),
        )
        .flatMap((trace) => {
          const price = sampleAt(trace.samples, at)
          return price === undefined ? [] : [price]
        }),
    ),
  ].toSorted((a, b) => a - b)
}
