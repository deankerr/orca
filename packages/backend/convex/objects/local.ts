/** Local reads shared by the configured reader and the one-hop source endpoints. */
import { ConvexError } from 'convex/values'

import { internal } from '#generated/api'
import type { ActionCtx, QueryCtx } from '#generated/server'

import { byteStoreFor } from './bytes'
import type { BlobRef } from './bytes'
import { assertReadCount } from './protocol'
import type { NameSelection, ObjectIdentity, StoredObject } from './protocol'
import { OBJECTS_LOCATORS_TABLE } from './table'

export async function findLocalNames(ctx: QueryCtx, args: NameSelection): Promise<string[]> {
  assertReadCount(args.limit)
  const rows = await ctx.db
    .query(OBJECTS_LOCATORS_TABLE)
    .withIndex('by_path_name', (q) => q.eq('path', args.path).gte('name', args.atOrAfter))
    .order(args.order ?? 'asc')
    .take(args.limit)
  return rows.map((row) => row.name)
}

/** Read the original compressed bytes, using only this deployment's committed locator. */
export async function readLocal(
  ctx: ActionCtx,
  identity: ObjectIdentity,
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
