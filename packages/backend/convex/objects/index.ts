/**
 * Named, insert-only object store.
 *
 * Import `store` / `load` from this module. Callers pass uncompressed text.
 * UTF-8, gzip, the storage backend, and the locators table stay inside the
 * module. Backend is chosen from `path` in `backend.ts`.
 */
import { ConvexError } from 'convex/values'
import { gunzipSync, gzipSync } from 'fflate'

import { internal } from '../_generated/api'
import type { ActionCtx } from '../_generated/server'
import { backendFor } from './backend'
import { byteStoreFor } from './bytes'
import type { BlobRef } from './bytes'
import type { Locator } from './table'

/** Opaque identity of one stored object. Neither field is derived from the other. */
export type ObjectIdentity = {
  /** Grouping prefix. An object-storage backend uses this as the key prefix. */
  path: string

  /** Object name within `path`. Not parsed and not a storage locator. */
  name: string
}

function blobRef(locator: Locator): BlobRef {
  return locator.backend === 'r2'
    ? { backend: 'r2', r2_key: locator.r2_key }
    : { backend: 'convex', storage_id: locator.storage_id }
}

function decodeGzip(bytes: Uint8Array) {
  return new TextDecoder().decode(gunzipSync(bytes))
}

/**
 * Persist uncompressed text under an identity. Insert-only.
 *
 * @param args.text - Logical contents to store, not the compressed form.
 * @throws {ConvexError} If this pair already exists, or the locator row could
 *   not be written after the blob.
 */
export async function store(
  ctx: ActionCtx,
  args: ObjectIdentity & { text: string },
): Promise<void> {
  const identity = { path: args.path, name: args.name }

  const existing = await ctx.runQuery(internal.objects.locators.get, identity)

  if (existing !== null) {
    throw new ConvexError({
      message: 'object already exists',
      ...identity,
    })
  }

  const encoded = new TextEncoder().encode(args.text)
  // gzip mtime: 0 keeps the compressor header stable
  const compressed = gzipSync(encoded, { mtime: 0 })

  const backend = backendFor(args.path)
  const ref = await byteStoreFor(ctx, backend).put(compressed, identity)

  await insertLocator(ctx, identity, {
    ...identity,
    ...ref,
    codec: 'gzip',
    size: encoded.byteLength,
  })
}

/** A committed locator is a duplicate; otherwise the blob is an orphan. */
async function insertLocator(ctx: ActionCtx, identity: ObjectIdentity, locator: Locator) {
  try {
    await ctx.runMutation(internal.objects.locators.insert, { locator })
  } catch {
    const raced = await ctx.runQuery(internal.objects.locators.get, identity)

    if (raced !== null) {
      throw new ConvexError({
        message: 'object already exists',
        ...identity,
      })
    }

    throw new ConvexError({
      message: 'orphaned blob: locator insert failed after store',
      ...identity,
    })
  }
}

/**
 * Return the uncompressed text previously stored under this identity.
 *
 * @returns The text, or `null` if nothing was stored under this pair.
 * @throws {ConvexError} If a locator exists but the blob behind it is gone.
 */
export async function load(ctx: ActionCtx, args: ObjectIdentity): Promise<string | null> {
  const identity = { path: args.path, name: args.name }

  const locator = await ctx.runQuery(internal.objects.locators.get, identity)

  if (locator === null) {
    return null
  }

  const body = await byteStoreFor(ctx, locator.backend).get(blobRef(locator))

  if (body === null) {
    throw new ConvexError({
      message: 'object blob missing',
      ...identity,
    })
  }

  return decodeGzip(body)
}
