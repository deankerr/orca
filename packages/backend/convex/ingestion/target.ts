import { docValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import { z } from 'zod'

import { internalMutation, internalQuery } from '#generated/server'

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

/** Set the requested range independently of running the sync worker. */
export const set = internalMutation({
  args: ingestionTargetRange.fields,
  returns: v.id(INGESTION_TARGET_TABLE),
  handler: async (ctx, args) => {
    const range = IngestionTargetRange.parse(args)
    const target = await ctx.db.query(INGESTION_TARGET_TABLE).unique()

    if (target === null) {
      return await ctx.db.insert(INGESTION_TARGET_TABLE, range)
    }

    if (target.start_at !== range.start_at || target.end_at > range.end_at) {
      throw new ConvexError('Keep the ingestion beginning fixed and only advance its end')
    }

    if (target.end_at < range.end_at) {
      await ctx.db.patch(INGESTION_TARGET_TABLE, target._id, { end_at: range.end_at })
    }

    return target._id
  },
})

export const get = internalQuery({
  args: {},
  returns: v.union(v.null(), docValidator(INGESTION_TARGET_TABLE, ingestionTargetTable)),
  handler: async (ctx) => await ctx.db.query(INGESTION_TARGET_TABLE).unique(),
})
