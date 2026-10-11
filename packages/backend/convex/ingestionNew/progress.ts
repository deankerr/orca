import { ConvexError } from 'convex/values'
import type { Infer } from 'convex/values'

import type { MutationCtx } from '#generated/server'

import { INGESTIONS_TABLE, ingestKeys } from './table'
import type { IngestKey, ownership } from './table'

export type Ownership = Infer<typeof ownership>

/** Advance with the projection's writes in the same transaction; any failure rolls both back. */
export async function checkpoint(ctx: MutationCtx, owner: Ownership, key: IngestKey) {
  const record = await ctx.db.get(INGESTIONS_TABLE, owner.ingestion_id)

  if (record === null || record.work_id !== owner.work_id || record.stage === 'complete') {
    throw new ConvexError('Ingestion work no longer owns this input')
  }

  const previous = record.stage === null ? -1 : ingestKeys.indexOf(record.stage)
  const next = ingestKeys.indexOf(key)

  if (next <= previous) {
    return false
  }

  if (next !== previous + 1) {
    throw new ConvexError('Ingest does not follow the committed stage')
  }

  await ctx.db.patch(INGESTIONS_TABLE, record._id, { stage: key })
  return true
}
