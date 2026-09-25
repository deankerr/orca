import { ConvexError } from 'convex/values'

import type { ActionCtx } from '../_generated/server'
import { artifactName, loadScanArtifact, nextScanAt } from '../scan/artifact'
import { extractScan } from './scan/extract'
import type { ExtractedScan } from './scan/extract'
import { assertScanAt, assertScanPair } from './scan/time'

export type ScanPair = { from_scan_at: string; scan_at: string }
export type LoadedScanPair = { previous: ExtractedScan; next: ExtractedScan }

/** Find the next pair, using the first two captures when no clock exists. */
export async function nextPair(
  ctx: Pick<ActionCtx, 'runQuery'>,
  clock: string | null,
): Promise<ScanPair | null> {
  const from = clock ?? (await nextScanAt(ctx, null))
  if (from === null) {
    return null
  }

  const to = await nextScanAt(ctx, from)
  if (to === null) {
    return null
  }

  assertScanPair(from, to)
  return { from_scan_at: from, scan_at: to }
}

/** Load the observations belonging to a claimed pair. */
export async function loadPair(ctx: ActionCtx, pair: ScanPair): Promise<LoadedScanPair> {
  const [previous, next] = await Promise.all([
    loadEntities(ctx, pair.from_scan_at),
    loadEntities(ctx, pair.scan_at),
  ])
  return { previous, next }
}

/** Load an existing Scan artifact and unwrap its scoped entity observations. */
export async function loadEntities(ctx: ActionCtx, scanAt: string): Promise<ExtractedScan> {
  return await loadArtifactEntities(ctx, artifactName(assertScanAt(scanAt)))
}

/** Artifact discovery uses the shared Scan module's opaque names. */
export async function loadArtifactEntities(
  ctx: ActionCtx,
  artifactId: string,
): Promise<ExtractedScan> {
  const artifact = await loadScanArtifact(ctx, artifactId)

  if (
    artifactName(assertScanAt(artifact.scan_at)) !== artifactId ||
    artifact.entries.some((entry) => entry.scan_at !== artifact.scan_at)
  ) {
    throw new ConvexError(`Scan artifact identity does not match ${artifactId}`)
  }

  return extractScan(artifact.scan_at, artifact.entries)
}

export type { ExtractedScan } from './scan/extract'
export { Endpoint, Model, Provider } from './scan/entities'
