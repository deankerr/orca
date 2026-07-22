import type { EndpointPricingHistory, PricingMetric } from './types'

export type PricingSeries = EndpointPricingHistory['series'][number]

export type ProviderPricingSeries = {
  providerId: string
  series: PricingSeries[]
}

/** Treat replacement endpoint UUIDs with the same provider tag as one
 * user-facing series. The backend still retains each UUID independently. */
export function groupSeriesByProvider(seriesList: readonly PricingSeries[]) {
  const groups = new Map<string, ProviderPricingSeries>()

  for (const series of seriesList) {
    const providerId = series.provider.tag_slug
    const group = groups.get(providerId)
    if (group === undefined) {
      groups.set(providerId, { providerId, series: [series] })
    } else {
      group.series.push(series)
    }
  }

  return [...groups.values()]
}

/** Whether a series ever had an observable price for the metric. */
export function hasMetricHistory(series: PricingSeries, metric: PricingMetric) {
  return series.points.some((point) => point.available && point.pricing[metric] !== undefined)
}

export function hasProviderMetricHistory(provider: ProviderPricingSeries, metric: PricingMetric) {
  return provider.series.some((series) => hasMetricHistory(series, metric))
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

export function providerPriceAt(
  provider: ProviderPricingSeries,
  metric: PricingMetric,
  at: number,
) {
  for (const series of provider.series) {
    const price = priceAt(series, metric, at)
    if (price !== undefined) {
      return price
    }
  }
  return undefined
}
