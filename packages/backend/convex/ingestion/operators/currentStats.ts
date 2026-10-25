import * as R from 'remeda'
import { z } from 'zod'

import type { CurrentStatsRow } from '../../catalog/tables/current'
import type { Source } from './source'

const Metric = z.number().nonnegative().optional().catch(undefined)

const CurrentSample = z
  .object({ p50_latency: Metric, p50_throughput: Metric })
  .transform(R.pickBy(R.isDefined))

export type Snapshot = { scan_at: string; rows: CurrentStatsRow[] }

/** The introduced scan's complete default-tier snapshot; an empty snapshot is still complete. */
export function derive({ next }: Source): Snapshot {
  const rows = R.pipe(
    next.stats,
    R.filter(({ tier }) => tier === 'default'),
    R.map(({ endpoint_id, sample }) => ({ endpoint_id, metrics: CurrentSample.parse(sample) })),
    R.filter(({ metrics }) => !R.isEmpty(metrics)),
    R.map(({ endpoint_id, metrics }) => ({ endpoint_id, ...metrics })),
  )

  return { rows, scan_at: next.scan_at }
}

/** A whole snapshot replaces an older one; members from different scans never combine. */
export function supersedes(retained: Snapshot | null, incoming: Snapshot): boolean {
  return retained === null || incoming.scan_at > retained.scan_at
}
