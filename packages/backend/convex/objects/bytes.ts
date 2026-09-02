import type { Id } from '../_generated/dataModel'
import type { ActionCtx } from '../_generated/server'
import type { ObjectBackend } from './backend'
import { createR2Transport, r2Key } from './r2'
import type { R2Transport } from './r2'

/** Assigned handle for compressed bytes. Opaque outside this module. */
export type BlobRef =
  | { backend: 'convex'; storage_id: Id<'_storage'> }
  | { backend: 'r2'; r2_key: string }

/** Compressed bytes in and out. Uniqueness and codec live in core. */
export type ByteStore = {
  /** Persist compressed bytes. Does not enforce insert-only. */
  put: (bytes: Uint8Array, identity: { path: string; name: string }) => Promise<BlobRef>
  /** Compressed bytes, or `null` if the blob is gone. */
  get: (ref: BlobRef) => Promise<Uint8Array | null>
}

/** Byte store for this backend. Write routing and locators pick the backend. */
export function byteStoreFor(ctx: ActionCtx, backend: ObjectBackend): ByteStore {
  return backend === 'r2' ? r2ByteStore(createR2Transport()) : convexByteStore(ctx)
}

function convexByteStore(ctx: ActionCtx): ByteStore {
  return {
    async put(bytes) {
      const storage_id = await ctx.storage.store(
        new Blob([new Uint8Array(bytes)], { type: 'application/gzip' }),
      )
      return { backend: 'convex', storage_id }
    },
    async get(ref) {
      if (ref.backend !== 'convex') {
        throw new Error('byte store: convex adapter given a non-convex ref')
      }

      const blob = await ctx.storage.get(ref.storage_id)
      if (blob === null) {
        return null
      }

      return new Uint8Array(await blob.arrayBuffer())
    },
  }
}

function r2ByteStore(transport: R2Transport): ByteStore {
  return {
    async put(bytes, identity) {
      const r2_key = r2Key(identity.path, identity.name)
      await transport.put(r2_key, bytes)
      return { backend: 'r2', r2_key }
    },
    async get(ref) {
      if (ref.backend !== 'r2') {
        throw new Error('byte store: r2 adapter given a non-r2 ref')
      }

      return await transport.get(ref.r2_key)
    },
  }
}
