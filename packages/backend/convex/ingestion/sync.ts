import type { WorkId } from '@convex-dev/workpool'
import { pick } from 'convex-helpers'
import { docValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import type { Infer } from 'convex/values'

import { internal } from '#generated/api'
import type { Doc } from '#generated/dataModel'
import { internalAction, internalMutation, internalQuery } from '#generated/server'
import type { MutationCtx } from '#generated/server'
import * as scans from '#scans'

import { ingestArgs } from './input'
import { pool } from './pool'
import {
  INGESTION_TARGET_TABLE,
  ingestionTargetRange,
  ingestionTargetTable,
  SCAN_PAIRS_TABLE,
} from './tables'

const PENDING_PAIR_PAGE_SIZE = 50
const pendingEnqueueResult = v.object({
  isDone: v.boolean(),
  continueCursor: v.string(),
  requeued: v.number(),
})
const syncResult = v.object({
  ...ingestionTargetRange.fields,
  registered: v.number(),
  requeued: v.number(),
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
    const counts = { registered: 0, requeued: 0 }
    let cursor: string | null = null

    for (;;) {
      const enqueued: Infer<typeof pendingEnqueueResult> = await ctx.runMutation(
        internal.ingestion.sync.enqueuePending,
        {
          end_at,
          cursor,
        },
      )

      counts.requeued += enqueued.requeued

      if (enqueued.isDone) {
        break
      }

      cursor = enqueued.continueCursor
    }

    let previous = last_scan_at

    for (;;) {
      const from = previous
      const names = await scans.listAtOrAfter(ctx, from ?? start_at)
      const selected = names.filter(
        (scan_at) => (from === null || scan_at > from) && scan_at <= end_at,
      )
      const last = selected.at(-1)

      if (last === undefined) {
        break
      }

      // Establish the last pair's flag before committing any jobs from this page.
      const following =
        names.find((scan_at) => scan_at > last) ?? (await scans.nextAfter(ctx, last))
      const hasLater = following !== null && following <= end_at
      const pairs = selected.map((scan_at, index) => ({
        from_scan_at: index === 0 ? from : selected[index - 1],
        scan_at,
        has_later_scan: index < selected.length - 1 || hasLater,
      }))

      counts.registered += await ctx.runMutation(internal.ingestion.sync.registerAndEnqueuePairs, {
        target_id: target._id,
        pairs,
      })
      previous = last

      if (!hasLater) {
        break
      }
    }

    await ctx.runMutation(internal.ingestion.target.recordDiscoveryProgress, {
      target_id: target._id,
      end_at,
    })

    return { start_at, end_at, ...counts, last_scan_at: previous }
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
  args: { target_id: v.id(INGESTION_TARGET_TABLE), pairs: v.array(ingestArgs) },
  returns: v.number(),
  handler: async (ctx, { target_id, pairs }): Promise<number> => {
    const target = await ctx.db.get(INGESTION_TARGET_TABLE, target_id)

    if (target === null) {
      throw new ConvexError('Ingestion target not found')
    }

    const last = await ctx.db.query(SCAN_PAIRS_TABLE).withIndex('by_scan_at').order('desc').first()
    let previous = last?.scan_at ?? null
    const newPairs: Infer<typeof ingestArgs>[] = []

    for (const pair of pairs) {
      const existing = await ctx.db
        .query(SCAN_PAIRS_TABLE)
        .withIndex('by_scan_at', (q) => q.eq('scan_at', pair.scan_at))
        .unique()

      if (existing !== null) {
        if (existing.from_scan_at !== pair.from_scan_at) {
          throw new ConvexError('A registered scan cannot change its predecessor')
        }

        continue
      }

      if (
        pair.from_scan_at !== previous ||
        (previous !== null && pair.scan_at <= previous) ||
        pair.scan_at < target.start_at ||
        pair.scan_at > target.end_at
      ) {
        throw new ConvexError(
          'New scan pairs must extend the registered timeline within its target',
        )
      }

      newPairs.push(pair)
      previous = pair.scan_at
    }

    const ids = await enqueueIngestWorkers(ctx, newPairs)

    for (const [index, pair] of newPairs.entries()) {
      await ctx.db.insert(SCAN_PAIRS_TABLE, { ...pair, state: 'queued', work_id: ids[index] })
    }

    return newPairs.length
  },
})

/** Only pending pairs are eligible; terminal failures remain failed. */
export const enqueuePending = internalMutation({
  args: { end_at: v.string(), cursor: v.union(v.string(), v.null()) },
  returns: pendingEnqueueResult,
  handler: async (ctx, { end_at, cursor }): Promise<Infer<typeof pendingEnqueueResult>> => {
    const page = await ctx.db
      .query(SCAN_PAIRS_TABLE)
      .withIndex('by_state_and_scan_at', (q) => q.eq('state', 'pending').lte('scan_at', end_at))
      .paginate({ numItems: PENDING_PAIR_PAGE_SIZE, cursor })
    const ids = await enqueueIngestWorkers(ctx, page.page.map(pairArgs))

    for (const [index, pair] of page.page.entries()) {
      await ctx.db.patch(SCAN_PAIRS_TABLE, pair._id, {
        state: 'queued',
        work_id: ids[index],
        result: undefined,
      })
    }

    return {
      isDone: page.isDone,
      continueCursor: page.continueCursor,
      requeued: page.page.length,
    }
  },
})

function pairArgs(pair: Doc<typeof SCAN_PAIRS_TABLE>): Infer<typeof ingestArgs> {
  return pick(pair, ['from_scan_at', 'scan_at', 'has_later_scan'])
}

async function enqueueIngestWorkers(
  ctx: MutationCtx,
  pairs: Infer<typeof ingestArgs>[],
): Promise<WorkId[]> {
  return pairs.length === 0
    ? []
    : await pool.enqueueActionBatch(ctx, internal.ingestion.ingest.run, pairs, {
        onComplete: internal.ingestion.pairs.onIngestComplete,
        context: null,
      })
}
