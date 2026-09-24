import { ConvexError } from 'convex/values'

import type { ActionCtx } from '../../_generated/server'
import { loadScanArtifact } from '../../scan/artifact'
import { extractScan } from './extract'
import type { ExtractedScan } from './extract'
import { artifactName } from './time'

/** Load an existing Scan artifact and unwrap its scoped entity observations. */
export async function loadEntities(ctx: ActionCtx, scanAt: string): Promise<ExtractedScan> {
  return await loadArtifactEntities(ctx, artifactName(scanAt))
}

/** Artifact discovery uses the shared Scan module's opaque names. */
export async function loadArtifactEntities(
  ctx: ActionCtx,
  artifactId: string,
): Promise<ExtractedScan> {
  const artifact = await loadScanArtifact(ctx, artifactId)

  if (
    artifactName(artifact.scan_at) !== artifactId ||
    artifact.entries.some((entry) => entry.scan_at !== artifact.scan_at)
  ) {
    throw new ConvexError(`Scan artifact identity does not match ${artifactId}`)
  }

  return extractScan(artifact.scan_at, artifact.entries)
}

export type { ExtractedEndpoint, ExtractedEntity, ExtractedScan } from './extract'
