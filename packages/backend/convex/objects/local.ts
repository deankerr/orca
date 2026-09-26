/** Local read implementation shared by the canonical reader and the one-hop source endpoints. */
import { ConvexError, v } from 'convex/values'
import type { Infer } from 'convex/values'
import { gunzipSync } from 'fflate'

import { internal } from '../_generated/api'
import type { ActionCtx, QueryCtx } from '../_generated/server'
import { byteStoreFor } from './bytes'
import type { BlobRef } from './bytes'
import { OBJECTS_LOCATORS_TABLE } from './table'

export const objectIdentity = v.object({ path: v.string(), name: v.string() })
export const nameSelection = v.object({
  path: v.string(),
  atOrAfter: v.string(),
  limit: v.number(),
})
export type NameSelection = Infer<typeof nameSelection>

/** Wire representation stays private to objects; consumers receive decoded text. */
export const storedObject = v.object({ codec: v.literal('gzip'), bytes: v.bytes() })
export const storedBatch = v.array(v.union(v.null(), storedObject))
type StoredObject = Infer<typeof storedObject>

export function assertReadCount(count: number): void {
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    throw new ConvexError('Object reads require between 1 and 100 items')
  }
}

export async function findLocalNames(ctx: QueryCtx, args: NameSelection): Promise<string[]> {
  assertReadCount(args.limit)
  const rows = await ctx.db
    .query(OBJECTS_LOCATORS_TABLE)
    .withIndex('by_path_name', (q) => q.eq('path', args.path).gte('name', args.atOrAfter))
    .take(args.limit)
  return rows.map((row) => row.name)
}

/** Read the original compressed bytes, using only this deployment's committed locator. */
export async function readLocal(
  ctx: ActionCtx,
  identity: Infer<typeof objectIdentity>,
): Promise<StoredObject | null> {
  const locator = await ctx.runQuery(internal.objects.locators.get, identity)
  if (locator === null) {
    return null
  }
  const ref: BlobRef =
    locator.backend === 'r2'
      ? { backend: 'r2', r2_key: locator.r2_key }
      : { backend: 'convex', storage_id: locator.storage_id }
  const body = await byteStoreFor(ctx, locator.backend).get(ref)
  if (body === null) {
    throw new ConvexError({ message: 'object blob missing', ...identity })
  }
  return { codec: locator.codec, bytes: new Uint8Array(body).buffer }
}

export function decode(stored: StoredObject | null): string | null {
  return stored === null ? null : new TextDecoder().decode(gunzipSync(new Uint8Array(stored.bytes)))
}
