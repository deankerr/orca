import { docValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import type { Infer } from 'convex/values'
import { z } from 'zod'

import type { Id } from '#generated/dataModel'
import { internalMutation, internalQuery } from '#generated/server'
import type { MutationCtx } from '#generated/server'

import { IsoDateTime } from '../isodatetime'
import { INGESTION_TARGET_TABLE, ingestionTargetRange, ingestionTargetTable } from './tables'

const RangeBoundary = z
  .union([z.iso.date(), IsoDateTime])
  .transform((value) => new Date(value).toISOString())
const IngestionTargetRange = z
  .object({ start_at: RangeBoundary, end_at: RangeBoundary })
  .refine(({ start_at, end_at }) => start_at <= end_at, {
    message: 'Ingestion range must move forward in time',
  })

/** Set or widen the requested range; the next sync registers toward it. */
export const set = internalMutation({
  args: ingestionTargetRange.fields,
  returns: v.id(INGESTION_TARGET_TABLE),
  handler: async (ctx, args) => await setTarget(ctx, args),
})

export async function setTarget(
  ctx: MutationCtx,
  args: Infer<typeof ingestionTargetRange>,
): Promise<Id<typeof INGESTION_TARGET_TABLE>> {
  const range = IngestionTargetRange.parse(args)
  const target = await ctx.db.query(INGESTION_TARGET_TABLE).unique()

  if (target !== null && (range.start_at > target.start_at || range.end_at < target.end_at)) {
    throw new ConvexError('The ingestion range can widen but never shrink')
  }

  const id = target === null ? await ctx.db.insert(INGESTION_TARGET_TABLE, range) : target._id

  if (target !== null) {
    await ctx.db.patch(INGESTION_TARGET_TABLE, id, range)
  }

  return id
}

export const get = internalQuery({
  args: {},
  returns: v.union(v.null(), docValidator(INGESTION_TARGET_TABLE, ingestionTargetTable)),
  handler: async (ctx) => await ctx.db.query(INGESTION_TARGET_TABLE).unique(),
})
