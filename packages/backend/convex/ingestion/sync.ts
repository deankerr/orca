import { docValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import type { Infer } from 'convex/values'

import { internal } from '#generated/api'
import { internalAction, internalMutation, internalQuery } from '#generated/server'
import * as scans from '#scans'

import { ingestArgs } from './input'
import { pool } from './pool'
import {
  INGESTION_TARGET_TABLE,
  ingestionTargetRange,
  ingestionTargetTable,
  SCAN_PAIRS_TABLE,
} from './tables'

const syncResult = v.object({
  ...ingestionTargetRange.fields,
  registered: v.number(),
  last_scan_at: v.union(v.string(), v.null()),
})

/** Implement the stored target; queued workers continue independently after this action returns or fails. */
export const run = internalAction({
  args: {},
  returns: syncResult,
  handler: async (ctx): Promise<Infer<typeof syncResult>> => {
    const { target, last_scan_at } = await ctx.runQuery(
      internal.ingestion.sync.getTargetAndLastRegisteredScan,
      {},
    )
    const { start_at, end_at } = target
    let registered = 0
    let previous = last_scan_at

    for (;;) {
      const from = previous
      const { times, has_more } = await scans.pageInRange(ctx, {
        start_at,
        end_at,
        after: from,
      })
      const last = times.at(-1)

      if (last === undefined) {
        break
      }

      const pairs = times.map((scan_at, index) => ({
        from_scan_at: index === 0 ? from : times[index - 1],
        scan_at,
        has_later_scan: index < times.length - 1 || has_more,
      }))

      registered += await ctx.runMutation(internal.ingestion.sync.registerAndEnqueuePairs, {
        pairs,
      })
      previous = last

      if (!has_more) {
        break
      }
    }

    return { start_at, end_at, registered, last_scan_at: previous }
  },
})

/** Read the target and resume position from the same database snapshot. */
export const getTargetAndLastRegisteredScan = internalQuery({
  args: {},
  returns: v.object({
    target: docValidator(INGESTION_TARGET_TABLE, ingestionTargetTable),
    last_scan_at: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    const target = await ctx.db.query(INGESTION_TARGET_TABLE).unique()

    if (target === null) {
      throw new ConvexError('Set an ingestion target before running sync')
    }

    const last = await ctx.db.query(SCAN_PAIRS_TABLE).withIndex('by_scan_at').order('desc').first()

    return { target, last_scan_at: last?.scan_at ?? null }
  },
})

/** Register pairs and enqueue their ingest workers atomically; concurrent sync workers reuse existing pairs. */
export const registerAndEnqueuePairs = internalMutation({
  args: { pairs: v.array(ingestArgs) },
  returns: v.number(),
  handler: async (ctx, { pairs }): Promise<number> => {
    const last = await ctx.db.query(SCAN_PAIRS_TABLE).withIndex('by_scan_at').order('desc').first()
    let previous = last?.scan_at ?? null
    const newPairs: Infer<typeof ingestArgs>[] = []

    for (const pair of pairs) {
      const existing = await ctx.db
        .query(SCAN_PAIRS_TABLE)
        .withIndex('by_scan_at', (q) => q.eq('scan_at', pair.scan_at))
        .unique()

      if (existing !== null) {
        continue
      }

      if (pair.from_scan_at !== previous) {
        throw new ConvexError('New scan pairs must extend the registered timeline')
      }

      newPairs.push(pair)
      previous = pair.scan_at
    }

    if (newPairs.length === 0) {
      return 0
    }

    const ids = await pool.enqueueActionBatch(ctx, internal.ingestion.ingest.run, newPairs, {
      onComplete: internal.ingestion.pairs.onIngestComplete,
      context: null,
    })

    for (const [index, pair] of newPairs.entries()) {
      await ctx.db.insert(SCAN_PAIRS_TABLE, { ...pair, state: 'queued', work_id: ids[index] })
    }

    return newPairs.length
  },
})
