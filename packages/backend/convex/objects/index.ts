/**
 * Named, insert-only object store with deployment-wide read-source selection.
 *
 * Import `store` / `load` from this module. Callers pass uncompressed text.
 * UTF-8, gzip, local/remote reads, the storage backend and locators stay inside
 * the module. Writes always use local storage, configured in `backend.ts`.
 */
import { ConvexError } from 'convex/values'
import { gzipSync } from 'fflate'

import { internal } from '#generated/api'
import { env } from '#generated/server'
import type { ActionCtx } from '#generated/server'

import { backendFor } from './backend'
import { byteStoreFor } from './bytes'
import { createObjectReader } from './client'
import { assertReadCount, decode, readLocal } from './local'
import type { NameSelection } from './local'
import type { Locator } from './table'

/** Opaque identity of one stored object. Neither field is derived from the other. */
export type ObjectIdentity = {
  /** Grouping prefix. An object-storage backend uses this as the key prefix. */
  path: string

  /** Object name within `path`. Not parsed and not a storage locator. */
  name: string
}

/** Logical read interface shared by deployment and standalone consumers. */
export interface ObjectReader {
  loadMany: (identities: ObjectIdentity[]) => Promise<(string | null)[]>
  namesAtOrAfter: (selection: NameSelection) => Promise<string[]>
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

  const backend = backendFor()
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
 * Return logical text from the configured source, or local storage when no source is configured.
 *
 * @returns The text, or `null` if nothing was stored under this pair.
 * @throws {ConvexError} If a locator exists but the blob behind it is gone.
 */
export async function load(ctx: ActionCtx, args: ObjectIdentity): Promise<string | null> {
  const [text] = await loadMany(ctx, [args])
  return text ?? null
}

/** Load 1–100 exact identities in input order; remote bytes stay compressed until received here. */
export async function loadMany(
  ctx: ActionCtx,
  objects: ObjectIdentity[],
): Promise<(string | null)[]> {
  assertReadCount(objects.length)
  const source = await readSource(ctx)

  if (source !== null) {
    return await source.loadMany(objects)
  }

  return await Promise.all(objects.map(async (identity) => decode(await readLocal(ctx, identity))))
}

/** Names at/after an inclusive lower bound, ascending by default. Descending returns greatest names first. */
export async function namesAtOrAfter(ctx: ActionCtx, selection: NameSelection): Promise<string[]> {
  assertReadCount(selection.limit)
  const source = await readSource(ctx)
  return source === null
    ? await ctx.runQuery(internal.objects.locators.namesAtOrAfter, selection)
    : await source.namesAtOrAfter(selection)
}

async function readSource(ctx: ActionCtx): Promise<ObjectReader | null> {
  const source = env.ORCA_OBJECTS_SOURCE_DEPLOYMENT

  if (source === undefined || source === '') {
    return null
  }

  const { name } = await ctx.meta.getDeploymentMetadata()

  if (source === name) {
    throw new ConvexError('Object source cannot be this deployment')
  }

  return createObjectReader(source, env.ORCA_OBJECTS_API_KEY ?? '')
}
