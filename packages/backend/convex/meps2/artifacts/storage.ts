import { gunzipSync, gzipSync } from 'fflate'
import { z } from 'zod'

import { internal } from '../../_generated/api'
import type { Id } from '../../_generated/dataModel'
import type { ActionCtx } from '../../_generated/server'
import { storeBlobWithRecord } from '../../lib/blobStore'

// envelope framing for stored blobs - self-describing so artifacts survive a storage-backend move
const ArtifactEnvelope = z.looseObject({
  artifact_id: z.string(),
  workflow: z.string(),
  timestamp: z.string(),
  format: z.string(),
  data: z.unknown(),
})

export type ArtifactEnvelope = z.output<typeof ArtifactEnvelope>

export type StoredArtifact = {
  artifact_id: string
  workflow: string
  format: string
  run_id: Id<'meps2_runs'>
  storage_id: Id<'_storage'>
  content_sha256: string
  size: { raw: number; blob: number }
  created_at: number
}

export async function storeArtifact(
  ctx: ActionCtx,
  args: {
    workflow: string
    timestamp: number
    format: string
    data: unknown
    run_id: Id<'meps2_runs'>
  },
): Promise<StoredArtifact> {
  const timestamp = new Date(args.timestamp).toISOString()
  const artifact_id = `${args.workflow}/${timestamp}`

  const envelope: ArtifactEnvelope = {
    artifact_id,
    workflow: args.workflow,
    timestamp,
    format: args.format,
    data: args.data,
  }

  const raw = new TextEncoder().encode(JSON.stringify(envelope))

  // hash the uncompressed bytes so identity is independent of gzip nondeterminism
  const digest = await crypto.subtle.digest('SHA-256', raw)
  const content_sha256 = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')

  // mtime: 0 makes gzip deterministic, so identical payloads produce identical blobs
  const blob = gzipSync(raw, { mtime: 0 })

  const artifact = {
    artifact_id,
    workflow: args.workflow,
    format: args.format,
    run_id: args.run_id,
    content_sha256,
    size: { raw: raw.byteLength, blob: blob.byteLength },
    created_at: args.timestamp,
  }

  const storage_id = await storeBlobWithRecord(ctx, {
    bytes: blob,
    content_type: 'application/gzip',
    record: async (storage_id) =>
      await ctx.runMutation(internal.meps2.artifacts.mutations.insertArtifact, {
        artifact: { ...artifact, storage_id },
      }),
  })

  return { ...artifact, storage_id }
}

export async function loadArtifact(ctx: ActionCtx, storage_id: Id<'_storage'>) {
  const blob = await ctx.storage.get(storage_id)

  if (blob === null) {
    throw new Error(`artifact blob not found: ${storage_id}`)
  }

  const json = new TextDecoder().decode(gunzipSync(new Uint8Array(await blob.arrayBuffer())))

  return ArtifactEnvelope.parse(JSON.parse(json))
}
