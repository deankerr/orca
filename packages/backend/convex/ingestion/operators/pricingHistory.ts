import { encodePricing } from '../../catalog/pricing'
import type { EndpointPriceRow } from '../../catalog/tables/pricing'
import { compare } from '../../compare'
import { endpointPricing } from '../lenses'
import { previousCollections } from './source'
import type { Source } from './source'

/** Complete quotes for arrivals and quote changes; departures store nothing. */
export function derive(source: Source): EndpointPriceRow[] {
  const previous = previousCollections(source)
  const rows: EndpointPriceRow[] = []

  for (const [endpoint_id, endpoint] of source.next.endpoints) {
    const before = previous.endpoints.get(endpoint_id)
    const pricing = endpointPricing(endpoint.pricing)

    if (before !== undefined && compare(endpointPricing(before.pricing), pricing).length === 0) {
      continue
    }

    rows.push({ endpoint_id, scan_at: source.next.scan_at, ...encodePricing(pricing) })
  }

  return rows
}
