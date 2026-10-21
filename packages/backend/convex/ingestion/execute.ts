import { vOnCompleteArgs } from '@convex-dev/workpool'
import type { RunResult, WorkId } from '@convex-dev/workpool'
import { ConvexError, v } from 'convex/values'

import { internal } from '#generated/api'
import type { Doc } from '#generated/dataModel'
import { internalAction, internalMutation } from '#generated/server'
import type { MutationCtx } from '#generated/server'
import * as scans from '#scans'

import { ingestors } from './ingestors'
import { scheduleQueue } from './queue'
import { writeRecords } from './records'
import type { RecordWrites } from './records'
import { ingestResult, removalResult } from './results'
import type { IngestResult, RemovalResult } from './results'
import { currentScope, INGESTION_RECORDS_TABLE } from './tables'

/**
 * Load a record's scans once; each process independently commits any outstanding output.
 * Any failed process fails the attempt, so Workpool retries it and receipts skip finished work.
 */
export const ingest = internalAction({
  args: {
    from_scan_at: v.union(v.string(), v.null()),
    scan_at: v.string(),
    scope: currentScope,
    current_stats: v.boolean(),
  },
  returns: v.array(ingestResult),
  handler: async (
    ctx,
    { from_scan_at, scan_at, scope, current_stats },
  ): Promise<IngestResult[]> => {
    const [previous, next] = await Promise.all([
      from_scan_at === null ? null : scans.load(ctx, from_scan_at),
      scans.load(ctx, scan_at),
    ])
    const results = await Promise.all(
      ingestors.map(
        async (process) => await process(ctx, { source: { previous, next }, scope, current_stats }),
      ),
    )

    return succeeded(scan_at, results)
  },
})

/** Remove output dated at the scan and release its receipts. */
export const withdraw = internalAction({
  args: { scan_at: v.string() },
  returns: v.array(removalResult),
  handler: async (ctx, { scan_at }): Promise<RemovalResult[]> =>
    succeeded(
      scan_at,
      await Promise.all(ingestors.map(async (process) => await process.remove(ctx, { scan_at }))),
    ),
})

export const onIngested = internalMutation({
  args: vOnCompleteArgs(undefined, v.array(ingestResult)),
  returns: v.null(),
  handler: async (ctx, { workId, result }) => {
    await settle(ctx, workId, result, async (records, record) => {
      await records.patch(record, { state: 'complete' })

      if (record.alerts) {
        await ctx.scheduler.runAfter(0, internal.products.discord.delivery.sendRecordAlerts, {
          record_id: record._id,
        })
      }
    })
    return null
  },
})

export const onWithdrawn = internalMutation({
  args: vOnCompleteArgs(undefined, v.array(removalResult)),
  returns: v.null(),
  handler: async (ctx, { workId, result }) => {
    await settle(ctx, workId, result, async (records, record) => {
      await records.delete(record)
    })
    return null
  },
})

/** Apply a terminal outcome to the request's own record, then let the queue worker continue. */
async function settle(
  ctx: MutationCtx,
  workId: WorkId,
  result: RunResult,
  success: (records: RecordWrites, record: Doc<typeof INGESTION_RECORDS_TABLE>) => Promise<void>,
) {
  // A record that was retried since carries a newer work ID, so a stale outcome finds nothing.
  const record = await ctx.db
    .query(INGESTION_RECORDS_TABLE)
    .withIndex('by_work_id', (q) => q.eq('work_id', workId))
    .unique()

  if (record === null) {
    return
  }

  await writeRecords(ctx, async (records) => {
    if (result.kind === 'success') {
      await success(records, record)
    } else {
      const error = result.kind === 'failed' ? result.error : 'Canceled'
      console.error('[ingestion] request failed', {
        record: record._id,
        scan_at: record.scan_at,
        error,
      })
      await records.patch(record, { state: 'failed', error })
    }
  })

  await scheduleQueue(ctx)
}

function succeeded<Result extends IngestResult | RemovalResult>(
  scan_at: string,
  results: Result[],
): Result[] {
  const failed = results.filter((result) => result.kind === 'failed')

  if (failed.length > 0) {
    throw new ConvexError({
      message: 'Ingestion processes failed',
      scan_at,
      failed: failed.map((result) =>
        result.kind === 'failed' ? `${result.process}: ${result.error.message}` : result.process,
      ),
    })
  }

  return results
}
