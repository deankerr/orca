import { vOnCompleteArgs } from '@convex-dev/workpool'
import { pick } from 'convex-helpers'
import { docValidator, paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'

import { internalMutation, internalQuery } from '#generated/server'
import type { MutationCtx } from '#generated/server'

import { ingestors } from './ingestors'
import { ingestResult } from './results'
import { SCAN_PAIRS_TABLE, scanPairsTable, PROCESS_COMMITS_TABLE } from './tables'

export const onIngestComplete = internalMutation({
  args: vOnCompleteArgs(v.null(), v.array(ingestResult)),
  returns: v.null(),
  handler: async (ctx, { workId, result }) => {
    const pair = await ctx.db
      .query(SCAN_PAIRS_TABLE)
      .withIndex('by_work_id', (q) => q.eq('work_id', workId))
      .unique()

    // An older callback has no row after a retry assigns a new work ID.
    if (pair !== null) {
      const state = (await hasAllProcessCommits(ctx, pair.scan_at)) ? 'complete' : 'failed'

      await ctx.db.patch(SCAN_PAIRS_TABLE, pair._id, { state, result })
      console.log('[ingestion] complete', {
        workId,
        pair: pick(pair, ['from_scan_at', 'scan_at', 'has_later_scan']),
        result,
      })
    }

    return null
  },
})

export const list = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(docValidator(SCAN_PAIRS_TABLE, scanPairsTable)),
  handler: async (ctx, { paginationOpts }) =>
    await ctx.db.query(SCAN_PAIRS_TABLE).withIndex('by_scan_at').paginate(paginationOpts),
})

async function hasAllProcessCommits(ctx: MutationCtx, scan_at: string): Promise<boolean> {
  const receipts = await Promise.all(
    ingestors.map(
      async ({ process }) =>
        await ctx.db
          .query(PROCESS_COMMITS_TABLE)
          .withIndex('by_scan_at_and_process', (q) =>
            q.eq('scan_at', scan_at).eq('process', process),
          )
          .unique(),
    ),
  )

  return receipts.every((receipt) => receipt !== null && receipt.removed_at === undefined)
}
