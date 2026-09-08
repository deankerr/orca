import { z } from 'zod'

import { query } from '../../_generated/server'
import { getCurrentScan } from '../ingestions'
import { V3_ENDPOINTS_STATS_SERIES_TABLE } from '../series.table'

const zReading = z.number().nonnegative().optional().catch(undefined)

/** Normalize the default-tier readings consumed by the grid. */
export const Stats = z
  .object({
    _id: z.string(),
    _creationTime: z.number(),
    endpoint_id: z.string(),
    scan_at: z.string(),
    tier: z.literal('default'),
    sample: z.object({ p50_throughput: zReading, p50_latency: zReading }),
  })
  .transform(({ sample, ...identity }) => ({ ...identity, ...sample }))

/** Missing readings stay absent; previous scans never supply current stats. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const scan = await getCurrentScan(ctx)

    if (scan === null) {
      return []
    }

    const rows = await ctx.db
      .query(V3_ENDPOINTS_STATS_SERIES_TABLE)
      .withIndex('by_scan_at', (q) => q.eq('scan_at', scan.scan_at))
      .collect()
    return rows.filter((row) => row.tier === 'default').map((row) => Stats.parse(row))
  },
})
