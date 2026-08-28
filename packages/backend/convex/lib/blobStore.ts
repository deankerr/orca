import type { Id } from '../_generated/dataModel'
import type { ActionCtx } from '../_generated/server'

// storing a file and recording its id are two steps that cannot be atomic:
// if the record mutation fails after the store succeeds, the blob is orphaned.
// compensation (deleting the blob) risks corrupting an append-only record if the
// mutation actually committed, so we log the id for manual/sweep cleanup instead.
export async function storeBlobWithRecord(
  ctx: ActionCtx,
  args: {
    bytes: Uint8Array<ArrayBuffer>
    content_type: string
    record: (storage_id: Id<'_storage'>) => Promise<unknown>
  },
) {
  const blob = new Blob([args.bytes], { type: args.content_type })
  const storage_id = await ctx.storage.store(blob)

  try {
    await args.record(storage_id)
  } catch (error) {
    console.error('[blobStore] orphaned blob - record mutation failed', {
      storage_id,
      content_type: args.content_type,
    })
    throw error
  }

  return storage_id
}
