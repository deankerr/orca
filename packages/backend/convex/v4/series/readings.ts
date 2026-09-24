import { withoutSystemFields } from 'convex-helpers'
import { paginationOptsValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import { isDeepEqual } from 'remeda'

import type { Doc } from '../../_generated/dataModel'
import { internalMutation, internalQuery } from '../../_generated/server'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import { currentScanAt } from '../ingestion/clock'
import { finishStep, stepArgs } from '../ingestion/step'
import { assertScanAt } from '../scan/time'
import { V4_ENDPOINT_READINGS_TABLE, endpointReadingsTable } from './table'
import type { EndpointReadingRow } from './table'

/**
 * Append supplied samples, including repeated measurements.
 * Samples do not carry forward. The index is not unique on tier, so one endpoint/scan is read
 * and compared in memory.
 */
export async function appendEndpointReadings(
  ctx: MutationCtx,
  rows: readonly EndpointReadingRow[],
): Promise<void> {
  const seen = new Map<string, Array<{ tier: string; sample: EndpointReadingRow['sample'] }>>()

  for (const row of rows) {
    assertScanAt(row.scan_at)
    const key = `${row.endpoint_id}\u0000${row.scan_at}`
    let existing = seen.get(key)

    if (existing === undefined) {
      const stored = await ctx.db
        .query(V4_ENDPOINT_READINGS_TABLE)
        .withIndex('by_endpoint_id_and_scan_at', (q) =>
          q.eq('endpoint_id', row.endpoint_id).eq('scan_at', row.scan_at),
        )
        .collect()

      existing = stored.map((reading) => ({ tier: reading.tier, sample: reading.sample }))
      seen.set(key, existing)
    }

    const match = existing.find((reading) => reading.tier === row.tier)

    if (match === undefined) {
      await ctx.db.insert(V4_ENDPOINT_READINGS_TABLE, row)
      existing.push({ tier: row.tier, sample: row.sample })
      continue
    }

    if (!isDeepEqual(match.sample, row.sample)) {
      throw new ConvexError(
        `Conflicting ${row.tier} reading for ${row.endpoint_id} at ${row.scan_at}`,
      )
    }
  }
}

/** Write this phase's readings and advance the ingestion. */
export const writeReadings = internalMutation({
  args: { ...stepArgs, rows: v.array(endpointReadingsTable.validator) },
  returns: v.string(),
  handler: async (ctx, args) =>
    await finishStep(ctx, { ...args, output: 'readings' }, args.rows, appendEndpointReadings),
})

/** Readings for one endpoint at an exact observation, including an empty result. */
export async function readingsAt(
  ctx: QueryCtx,
  endpointId: string,
  scanAt: string,
): Promise<Doc<typeof V4_ENDPOINT_READINGS_TABLE>[]> {
  return await ctx.db
    .query(V4_ENDPOINT_READINGS_TABLE)
    .withIndex('by_endpoint_id_and_scan_at', (q) =>
      q.eq('endpoint_id', endpointId).eq('scan_at', scanAt),
    )
    .collect()
}

/**
 * Page the samples stored at the ORCA clock.
 * An empty page is a valid current result. Missing samples are not filled from earlier scans.
 */
export const current = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(endpointReadingsTable.validator),
    isDone: v.boolean(),
    continueCursor: v.string(),
    scan_at: v.union(v.null(), v.string()),
  }),
  handler: async (ctx, args) => {
    const scanAt = await currentScanAt(ctx)

    if (scanAt === null) {
      return { page: [], isDone: true, continueCursor: '', scan_at: null }
    }

    const result = await ctx.db
      .query(V4_ENDPOINT_READINGS_TABLE)
      .withIndex('by_scan_at', (q) => q.eq('scan_at', scanAt))
      .paginate(args.paginationOpts)

    return {
      page: result.page.map(withoutSystemFields),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      scan_at: scanAt,
    }
  },
})
