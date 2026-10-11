import { vOnCompleteArgs } from '@convex-dev/workpool'
import { docValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'

import { internal } from '#generated/api'
import type { Doc } from '#generated/dataModel'
import { internalMutation, internalQuery } from '#generated/server'
import type { MutationCtx, QueryCtx } from '#generated/server'

import { pool } from './pool'
import { INGESTIONS_TABLE, ingestionsTable, ingestKeys, sourceInput } from './table'

const ingestionId = v.id(INGESTIONS_TABLE)
const record = docValidator(INGESTIONS_TABLE, ingestionsTable)

export async function latestRecord(ctx: QueryCtx) {
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

/** Only finalized inputs advance this timeline's reference clock. */
export const clock = internalQuery({
  args: {},
  returns: v.union(v.string(), v.null()),
  handler: async (ctx) => {
    const complete = await ctx.db
      .query(INGESTIONS_TABLE)
      .withIndex('by_stage_and_scan_at', (q) => q.eq('stage', 'complete'))
      .order('desc')
      .first()

    return complete?.scan_at ?? null
  },
})

export const inspect = internalQuery({
  args: { ingestion_id: ingestionId },
  returns: v.union(
    v.null(),
    v.object({
      record,
      execution: v.union(
        v.null(),
        v.literal('pending'),
        v.literal('running'),
        v.literal('finished'),
      ),
    }),
  ),
  handler: async (ctx, { ingestion_id }) => {
    const ingestion = await ctx.db.get(INGESTIONS_TABLE, ingestion_id)

    if (ingestion === null) {
      return null
    }

    const status =
      ingestion.work_id === undefined ? null : await pool.status(ctx, ingestion.work_id)
    return { record: ingestion, execution: status?.state ?? null }
  },
})

/** Admission and ownership are transactional, independently of pool concurrency. */
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

      await resumeRecord(ctx, existing)
      return existing._id
    }

    const previous = await latestRecord(ctx)

    if (previous !== null && previous.stage !== 'complete') {
      throw new ConvexError('Finish the current ingestion before admitting another input')
    }

    if (input.from_scan_at !== (previous?.scan_at ?? null)) {
      throw new ConvexError('Source input does not follow the completed timeline')
    }

    const id = await ctx.db.insert(INGESTIONS_TABLE, { ...input, stage: null })
    await enqueue(ctx, id)
    return id
  },
})

async function enqueue(ctx: MutationCtx, ingestion_id: Doc<typeof INGESTIONS_TABLE>['_id']) {
  const work_id = await pool.enqueueAction(
    ctx,
    internal.ingestionNew.run.apply,
    { ingestion_id },
    { onComplete: internal.ingestionNew.state.onComplete, context: { ingestion_id } },
  )

  await ctx.db.patch(INGESTIONS_TABLE, ingestion_id, { work_id })
}

async function finalize(ctx: MutationCtx, ingestion: Doc<typeof INGESTIONS_TABLE>) {
  await ctx.db.patch(INGESTIONS_TABLE, ingestion._id, { stage: 'complete', work_id: undefined })
  await ctx.scheduler.runAfter(0, internal.ingestionNew.run.run, {})
}

async function resumeRecord(ctx: MutationCtx, ingestion: Doc<typeof INGESTIONS_TABLE>) {
  if (ingestion.stage === 'complete') {
    return
  }

  if (ingestion.work_id !== undefined) {
    const status = await pool.status(ctx, ingestion.work_id)

    if (status.state !== 'finished') {
      return
    }
  }

  // Also reconciles a finished work item whose completion callback failed or was lost.
  if (ingestion.stage === ingestKeys.at(-1)) {
    await finalize(ctx, ingestion)
    return
  }

  await enqueue(ctx, ingestion._id)
}

/** Manual and periodic recovery share admission; pending/running work retains ownership. */
export const recover = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ingestion = await latestRecord(ctx)

    if (ingestion !== null) {
      await resumeRecord(ctx, ingestion)
    }

    return null
  },
})

export const onComplete = internalMutation({
  args: vOnCompleteArgs(v.object({ ingestion_id: ingestionId }), v.null()),
  returns: v.null(),
  handler: async (ctx, { workId, context, result }) => {
    const ingestion = await ctx.db.get(INGESTIONS_TABLE, context.ingestion_id)

    if (ingestion === null || ingestion.work_id !== workId || ingestion.stage === 'complete') {
      return null
    }

    if (result.kind === 'success') {
      if (ingestion.stage !== ingestKeys.at(-1)) {
        throw new ConvexError('Ingestion returned before every ingest committed')
      }

      await finalize(ctx, ingestion)
    } else {
      await ctx.db.patch(INGESTIONS_TABLE, ingestion._id, { work_id: undefined })
    }

    return null
  },
})
