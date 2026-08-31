import { ConvexError } from 'convex/values'
import { gunzipSync, gzipSync } from 'fflate'

import { internal } from '../../_generated/api'
import type { Id } from '../../_generated/dataModel'
import type { ActionCtx } from '../../_generated/server'

/** Opaque identity of one stored artifact. Neither field is derived from the other. */
export type ArtifactIdentity = {
  /** Grouping prefix. An object-storage backend uses this as the key prefix. */
  path: string

  /** Object name within `path`. Not parsed and not a storage locator. */
  artifact_id: string
}

/** Identity plus sizes after a successful store. */
export type StoredArtifact = ArtifactIdentity & {
  size: {
    /** Uncompressed byte length. */
    raw: number
    /** Stored blob length after the backend codec. */
    blob: number
  }
}

type LocatorRecord = StoredArtifact & {
  storage_id: Id<'_storage'>
}

/**
 * Persist uncompressed bytes under an identity. Insert-only.
 *
 * Compression and the storage locator stay inside this module.
 *
 * @param args.bytes - Logical contents to store, not the compressed form.
 * @throws {ConvexError} If this pair already exists, or the locator row could
 *   not be written after the blob.
 */
export async function store(
  ctx: ActionCtx,
  args: ArtifactIdentity & { bytes: Uint8Array },
): Promise<StoredArtifact> {
  const identity = { path: args.path, artifact_id: args.artifact_id }

  const existing: LocatorRecord | null = await ctx.runQuery(
    internal.meps2.artifacts.records.get,
    identity,
  )
  if (existing !== null) {
    throw new ConvexError({
      message: 'artifact already exists',
      ...identity,
    })
  }

  const compressed = gzipSync(args.bytes, { mtime: 0 })
  const storage_id = await ctx.storage.store(
    new Blob([new Uint8Array(compressed)], { type: 'application/gzip' }),
  )

  const stored: StoredArtifact = {
    ...identity,
    size: { raw: args.bytes.byteLength, blob: compressed.byteLength },
  }

  try {
    await ctx.runMutation(internal.meps2.artifacts.records.insert, {
      artifact: { ...stored, storage_id },
    })
  } catch {
    const raced: LocatorRecord | null = await ctx.runQuery(
      internal.meps2.artifacts.records.get,
      identity,
    )
    if (raced !== null) {
      throw new ConvexError({
        message: 'artifact already exists',
        ...identity,
      })
    }
    throw new ConvexError({
      message: 'orphaned blob: record insert failed after store',
      path: args.path,
      artifact_id: args.artifact_id,
      storage_id,
    })
  }

  return stored
}

/**
 * Return the uncompressed bytes previously stored under this identity.
 *
 * @throws {ConvexError} If nothing was stored under this pair, or the blob behind the locator is gone.
 */
export async function load(ctx: ActionCtx, args: ArtifactIdentity): Promise<Uint8Array> {
  const identity = { path: args.path, artifact_id: args.artifact_id }
  const record: LocatorRecord | null = await ctx.runQuery(
    internal.meps2.artifacts.records.get,
    identity,
  )

  if (record === null) {
    throw new ConvexError({
      message: 'artifact not found',
      ...identity,
    })
  }

  const blob = await ctx.storage.get(record.storage_id)

  if (blob === null) {
    throw new ConvexError({
      message: 'artifact blob missing',
      ...identity,
      storage_id: record.storage_id,
    })
  }

  return gunzipSync(new Uint8Array(await blob.arrayBuffer()))
}
