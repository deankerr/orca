import type { EndpointPricingHistory, PricingMetric } from '../types'

export type PricingSeries = EndpointPricingHistory['series'][number]

/** Whether a series ever had an observable price for the metric. */
export function hasMetricHistory(series: PricingSeries, metric: PricingMetric) {
  return series.points.some((point) => point.available && point.pricing[metric] !== undefined)
}

/** History stores state transitions, so an endpoint's state at any instant is
 * its most recent observation at or before it. */
export function stateAt(series: PricingSeries, at: number) {
  let state: PricingSeries['points'][number] | undefined
  for (const point of series.points) {
    if (point.at > at) {
      break
    }
    state = point
  }
  return state
}

/** The endpoint's standing price at an instant. Undefined while unavailable. */
export function priceAt(series: PricingSeries, metric: PricingMetric, at: number) {
  const state = stateAt(series, at)
  return state?.available === true ? state.pricing[metric] : undefined
}
