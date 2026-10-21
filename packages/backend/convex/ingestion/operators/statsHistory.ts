import type { EndpointStatsRow } from '../../catalog/tables/stats'
import type { Source } from './source'

/** Every reading supplied by the introduced scan; the previous scan contributes nothing. */
export function derive({ next }: Source): EndpointStatsRow[] {
  return next.stats.map((stats) => ({ ...stats, scan_at: next.scan_at }))
}
