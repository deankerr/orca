import { vOnCompleteArgs, vWorkId } from '@convex-dev/workpool'
import type { WorkId } from '@convex-dev/workpool'
import { ConvexError, v } from 'convex/values'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'

import { IsoDateTime } from '../isodatetime'
import { ingestResult } from './ingestor'
import { ingestArgs } from './input'
import { pool } from './pool'

/** Queue explicit pairs, including duplicates; each process owns its completion check. */
export const run = internalMutation({
  args: { pairs: v.array(ingestArgs) },
  returns: v.array(vWorkId),
  handler: async (ctx, { pairs }): Promise<WorkId[]> =>
    await Promise.all(
      pairs.map(async (pair) => {
        const scan_at = IsoDateTime.parse(pair.scan_at)
        const from_scan_at =
          pair.from_scan_at === null ? null : IsoDateTime.parse(pair.from_scan_at)

        if (from_scan_at !== null && from_scan_at >= scan_at) {
          throw new ConvexError('Scan pair must move forward in time')
        }

        const args = { ...pair, from_scan_at, scan_at }

        return await pool.enqueueAction(ctx, internal.ingestion.ingest.run, args, {
          onComplete: internal.ingestion.enqueue.onComplete,
          context: args,
        })
      }),
    ),
})

export const onComplete = internalMutation({
  args: vOnCompleteArgs(ingestArgs, v.array(ingestResult)),
  returns: v.null(),
  handler: (_ctx, { workId, context, result }) => {
    console.log('[ingestion] complete', { workId, pair: context, result })
    return null
  },
})
