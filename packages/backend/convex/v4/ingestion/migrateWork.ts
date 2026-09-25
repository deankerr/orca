import { ConvexError, v } from 'convex/values'

import { internal } from '../../_generated/api'
import { env, internalMutation } from '../../_generated/server'
import { findCursor } from './clock'
import { V4_INGESTIONS_TABLE, V4_PROCESSOR_WORK_TABLE } from './table'
import { findWork } from './work'

/**
 * Manual one-time migration after the production backfill has FINISHED and old loops are stopped.
 * Inserts work metadata only; never replays payloads or schedules processors. Safe to rerun.
 * Keep the frozen legacy cursors until every ingestion has work records for both processors.
 */
export const run = internalMutation({
  args: { after_scan_at: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { after_scan_at }) => {
    console.log('[v4:migrate-work] page', { after_scan_at, maxIngestions: 100, maxInserts: 200 })

    if (env.ORCA_V4_INGEST_ENABLED === 'true') {
      throw new ConvexError('Disable cron admission and stop ingestion before migrating work')
    }

    const first = await ctx.db.query(V4_INGESTIONS_TABLE).withIndex('by_scan_at').first()

    if (first === null) {
      return null
    }

    const cursors = []
    for (const processor of ['pricing', 'listings'] as const) {
      const cursor = await findCursor(ctx, processor)

      if (
        cursor?.scan_at === null ||
        cursor?.scan_at === undefined ||
        cursor.scan_at < first.from_scan_at
      ) {
        throw new ConvexError({ message: 'Legacy processor baseline is not complete', processor })
      }

      const scanAt = cursor.scan_at

      if (
        scanAt !== first.from_scan_at &&
        (await ctx.db
          .query(V4_INGESTIONS_TABLE)
          .withIndex('by_scan_at', (q) => q.eq('scan_at', scanAt))
          .unique()) === null
      ) {
        throw new ConvexError({
          message: 'Legacy cursor is not a released observation',
          processor,
          scan_at: cursor.scan_at,
        })
      }

      cursors.push({ processor, scan_at: cursor.scan_at })
    }
    const ingestions = await ctx.db
      .query(V4_INGESTIONS_TABLE)
      .withIndex('by_scan_at', (q) =>
        after_scan_at === undefined ? q : q.gt('scan_at', after_scan_at),
      )
      .take(100)
    for (const ingestion of ingestions) {
      for (const cursor of cursors) {
        if ((await findWork(ctx, ingestion._id, cursor.processor)) === null) {
          await ctx.db.insert(V4_PROCESSOR_WORK_TABLE, {
            ingestion_id: ingestion._id,
            processor: cursor.processor,
            scan_at: ingestion.scan_at,
            state: ingestion.scan_at <= cursor.scan_at ? 'complete' : 'pending',
          })
        }
      }
    }
    const last = ingestions.at(-1)

    if (ingestions.length === 100 && last !== undefined) {
      await ctx.scheduler.runAfter(0, internal.v4.ingestion.migrateWork.run, {
        after_scan_at: last.scan_at,
      })
    } else {
      console.log('[v4:migrate-work] complete; outstanding work remains pending')
    }

    return null
  },
})
