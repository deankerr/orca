import { docValidator } from 'convex/server'
import { v } from 'convex/values'

import type { Doc } from '../../_generated/dataModel'
import { internalQuery } from '../../_generated/server'
import type { QueryCtx } from '../../_generated/server'
import { cappedCutoff } from '../ingestion/clock'
import { V4_ENTITY_RECORDS_TABLE, entityKind, entityRecordsTable } from './table'
import type { EntityKind } from './table'

/**
 * Latest retained record at or before `cutoff`.
 * The caller supplies an already capped cutoff. A missing row carries its earlier value forward
 * only when an earlier row exists.
 */
export async function recordAtUncapped(
  ctx: QueryCtx,
  entityKindName: EntityKind,
  entityId: string,
  cutoff: string,
): Promise<Doc<typeof V4_ENTITY_RECORDS_TABLE> | null> {
  return await ctx.db
    .query(V4_ENTITY_RECORDS_TABLE)
    .withIndex('by_entity_kind_and_entity_id_and_scan_at', (q) =>
      q.eq('entity_kind', entityKindName).eq('entity_id', entityId).lte('scan_at', cutoff),
    )
    .order('desc')
    .first()
}

/** Latest record through the clock, carrying the value forward across unchanged scans. */
export const recordAt = internalQuery({
  args: { entity_kind: entityKind, entity_id: v.string(), cutoff: v.optional(v.string()) },
  returns: v.union(v.null(), docValidator(V4_ENTITY_RECORDS_TABLE, entityRecordsTable)),
  handler: async (ctx, args) => {
    const cutoff = await cappedCutoff(ctx, args.cutoff)
    return cutoff === null
      ? null
      : await recordAtUncapped(ctx, args.entity_kind, args.entity_id, cutoff)
  },
})

/**
 * Subject plus the related model and provider records at one cutoff.
 * Endpoint hydration requires both related records. Models and providers return themselves.
 */
export const contextAt = internalQuery({
  args: { entity_kind: entityKind, entity_id: v.string(), cutoff: v.optional(v.string()) },
  returns: v.object({
    subject: v.union(v.null(), docValidator(V4_ENTITY_RECORDS_TABLE, entityRecordsTable)),
    model: v.union(v.null(), docValidator(V4_ENTITY_RECORDS_TABLE, entityRecordsTable)),
    provider: v.union(v.null(), docValidator(V4_ENTITY_RECORDS_TABLE, entityRecordsTable)),
  }),
  handler: async (ctx, args) => {
    const cutoff = await cappedCutoff(ctx, args.cutoff)

    if (cutoff === null) {
      return { subject: null, model: null, provider: null }
    }

    const subject = await recordAtUncapped(ctx, args.entity_kind, args.entity_id, cutoff)

    if (subject === null || subject.entity_kind !== 'endpoint') {
      return { subject, model: null, provider: null }
    }

    const model =
      subject.model_id === undefined
        ? null
        : await recordAtUncapped(ctx, 'model', subject.model_id, cutoff)
    const provider =
      subject.provider_id === undefined
        ? null
        : await recordAtUncapped(ctx, 'provider', subject.provider_id, cutoff)

    return { subject, model, provider }
  },
})

/** Parse retained JSON for projection. Invalid stored text is a writer bug. */
export function parseRawJson(rawJson: string): unknown {
  return JSON.parse(rawJson) as unknown
}
