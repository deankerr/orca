import { docValidator } from 'convex/server'
import { v } from 'convex/values'

import { internalQuery } from '#generated/server'
import type { QueryCtx } from '#generated/server'

import { REGISTRATIONS_TABLE, registrationId, registrationsTable } from './table'

const record = docValidator(REGISTRATIONS_TABLE, registrationsTable)

export async function latestRecord(ctx: QueryCtx) {
  return await ctx.db.query(REGISTRATIONS_TABLE).withIndex('by_scan_at').order('desc').first()
}

export const latest = internalQuery({
  args: {},
  returns: v.union(record, v.null()),
  handler: latestRecord,
})

export const get = internalQuery({
  args: { registration_id: registrationId },
  returns: v.union(record, v.null()),
  handler: async (ctx, { registration_id }) =>
    await ctx.db.get(REGISTRATIONS_TABLE, registration_id),
})

/** Only completed registrations advance this timeline's reference clock. */
export const clock = internalQuery({
  args: {},
  returns: v.union(v.string(), v.null()),
  handler: async (ctx) => {
    const complete = await ctx.db
      .query(REGISTRATIONS_TABLE)
      .withIndex('by_progress_kind_and_scan_at', (q) => q.eq('progress.kind', 'complete'))
      .order('desc')
      .first()

    return complete?.scan_at ?? null
  },
})
