import type { ActionCtx } from '../_generated/server'
import { loadScanArtifact } from '../scan/artifact'
import { compareScanProjections, ScanProjection } from './index'

/** Load the source pair and prepare the shared inputs for this ingestion action. */
export async function prepareComparison(
  ctx: ActionCtx,
  fromArtifactId: string | null,
  toArtifactId: string,
) {
  const next = ScanProjection.parse(await loadScanArtifact(ctx, toArtifactId))
  const previous = ScanProjection.parse(
    fromArtifactId === null
      ? { id: 'initial', scan_at: '', entries: [] }
      : await loadScanArtifact(ctx, fromArtifactId),
  )
  return compareScanProjections(previous, next)
}
