import { docValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'

import { internal } from '#generated/api'
import { internalMutation, internalQuery } from '#generated/server'
import type { MutationCtx, QueryCtx } from '#generated/server'

import { pool } from './pool'
import { INGESTIONS_TABLE, ingestionId, ingestionsTable, sourceInput } from './table'
import type { InputId } from './table'

const record = docValidator(INGESTIONS_TABLE, ingestionsTable)

async function latestRecord(ctx: QueryCtx) {
  return await ctx.db.query(INGESTIONS_TABLE).withIndex('by_scan_at').order('desc').first()
}

export const latest = internalQuery({
  args: {},
  returns: v.union(record, v.null()),
  handler: latestRecord,
})

export const get = internalQuery({
  args: { ingestion_id: ingestionId },
  returns: v.union(record, v.null()),
  handler: async (ctx, { ingestion_id }) => await ctx.db.get(INGESTIONS_TABLE, ingestion_id),
})

/** Only completed inputs advance this timeline's reference clock. */
export const clock = internalQuery({
  args: {},
  returns: v.union(v.string(), v.null()),
  handler: async (ctx) => {
    const complete = await ctx.db
      .query(INGESTIONS_TABLE)
      .withIndex('by_progress_kind_and_scan_at', (q) => q.eq('progress.kind', 'complete'))
      .order('desc')
      .first()

    return complete?.scan_at ?? null
  },
})

/** Register exact source inputs in chronological order, independently of execution concurrency. */
export const register = internalMutation({
  args: sourceInput.fields,
  returns: ingestionId,
  handler: async (ctx, input) => {
    if (input.from_scan_at !== null && input.scan_at <= input.from_scan_at) {
      throw new ConvexError('Scan pair must move forward in canonical time')
    }

    const existing = await ctx.db
      .query(INGESTIONS_TABLE)
      .withIndex('by_scan_at', (q) => q.eq('scan_at', input.scan_at))
      .unique()

    if (existing !== null) {
      if (existing.from_scan_at !== input.from_scan_at) {
        throw new ConvexError('Source input differs from the registered ingestion')
      }

      if (existing.progress.kind === 'pending') {
        await enqueue(ctx, existing._id)
      }

      return existing._id
    }

    const previous = await latestRecord(ctx)

    if (previous !== null && previous.progress.kind !== 'complete') {
      throw new ConvexError('Complete the current input before admitting another')
    }

    if (input.from_scan_at !== (previous?.scan_at ?? null)) {
      throw new ConvexError('Source input does not follow the completed timeline')
    }

    const id = await ctx.db.insert(INGESTIONS_TABLE, {
      ...input,
      progress: { kind: 'pending', completed: [] },
    })
    await enqueue(ctx, id)
    return id
  },
})

async function enqueue(ctx: MutationCtx, ingestion_id: InputId) {
  await pool.enqueueAction(ctx, internal.ingestion.run.ingestInput, { ingestion_id })
}

/** Repeated triggers may enqueue overlapping attempts; committed progress prevents duplicate output. */
export const recover = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const input = await latestRecord(ctx)

    if (input?.progress.kind === 'pending') {
      await enqueue(ctx, input._id)
    }

    return null
  },
})
