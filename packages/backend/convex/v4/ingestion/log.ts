import { ConvexError, v } from 'convex/values'

import type { Id } from '../../_generated/dataModel'
import { internalMutation, internalQuery } from '../../_generated/server'
import { assertScanPair } from '../scan/time'
import { currentScanAt, findActiveIngestion } from './clock'
import { BASELINE_PHASE, FORWARD_PHASE } from './phases'
import { V4_INGESTIONS_TABLE } from './table'

const ingestionResult = v.object({
  id: v.id(V4_INGESTIONS_TABLE),
  from_scan_at: v.string(),
  scan_at: v.string(),
  phase: v.string(),
})

/**
 * Admit one ordinary pair.
 * The empty log reserves the baseline and the later output time. A later pair must start at the
 * completed clock. One unfinished ingestion is resumed; a second active pair is rejected.
 * ATTENTION: reverse ingestion and removal of a middle pair are not implemented. Removing a
 * non-latest ingestion would drop values that later unchanged scans never re-stored.
 */
export const admit = internalMutation({
  args: { from_scan_at: v.string(), scan_at: v.string() },
  returns: ingestionResult,
  handler: async (ctx, args) => {
    assertScanPair(args.from_scan_at, args.scan_at)
    const existing = await ctx.db
      .query(V4_INGESTIONS_TABLE)
      .withIndex('by_from_scan_at_and_scan_at', (q) =>
        q.eq('from_scan_at', args.from_scan_at).eq('scan_at', args.scan_at),
      )
      .unique()

    if (existing !== null) {
      return present(existing)
    }

    const active = await findActiveIngestion(ctx)

    if (active !== null) {
      throw new ConvexError('An ingestion is already active')
    }

    const owned = await ctx.db
      .query(V4_INGESTIONS_TABLE)
      .withIndex('by_scan_at', (q) => q.eq('scan_at', args.scan_at))
      .unique()

    if (owned !== null) {
      throw new ConvexError(`Output time ${args.scan_at} already has an owner`)
    }

    const clock = await currentScanAt(ctx)

    if (clock === null) {
      const anyRow = await ctx.db.query(V4_INGESTIONS_TABLE).first()

      if (anyRow !== null) {
        throw new ConvexError('Ingestion log has no completed clock')
      }

      const id = await ctx.db.insert(V4_INGESTIONS_TABLE, {
        from_scan_at: args.from_scan_at,
        scan_at: args.scan_at,
        phase: BASELINE_PHASE,
      })
      return { id, ...args, phase: BASELINE_PHASE }
    }

    if (args.from_scan_at !== clock) {
      throw new ConvexError('Ordinary ingestion must start at the completed clock')
    }

    const id = await ctx.db.insert(V4_INGESTIONS_TABLE, {
      from_scan_at: args.from_scan_at,
      scan_at: args.scan_at,
      phase: FORWARD_PHASE,
    })
    return { id, ...args, phase: FORWARD_PHASE }
  },
})

/** Read one ingestion. */
export const get = internalQuery({
  args: { id: v.id(V4_INGESTIONS_TABLE) },
  returns: v.union(v.null(), ingestionResult),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(V4_INGESTIONS_TABLE, args.id)
    return row === null ? null : present(row)
  },
})

/** Resume the unfinished ingestion, when one exists. */
export const active = internalQuery({
  args: {},
  returns: v.union(v.null(), ingestionResult),
  handler: async (ctx) => {
    const row = await findActiveIngestion(ctx)
    return row === null ? null : present(row)
  },
})

function present(row: {
  _id: Id<typeof V4_INGESTIONS_TABLE>
  from_scan_at: string
  scan_at: string
  phase: string
}) {
  return {
    id: row._id,
    from_scan_at: row.from_scan_at,
    scan_at: row.scan_at,
    phase: row.phase,
  }
}
