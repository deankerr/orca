import { ConvexError } from 'convex/values'

import type { ActionCtx } from '../../_generated/server'
import { load, namesAtOrAfter } from '../../objects'
import { artifactName, parseScanArtifact } from '../../scan/artifact'
import { transformScanToV2Models } from './compatibility'
import { OrcaPublicApiV2Schema } from './schema'
import type { OrcaPublicApiV2 } from './schema'

/** Discover immutable scan identities without downloading bodies or consulting product state. */
export async function latestScanId(
  ctx: ActionCtx,
  cachedScanId: string | null = null,
): Promise<string | null> {
  let latest = cachedScanId

  // Existing object discovery is ascending and inclusive. Only the first refresh walks history;
  // later checks start at the cached identity. Full pages overlap by one name to avoid skipping scans.
  while (true) {
    const names = await namesAtOrAfter(ctx, {
      path: 'scans',
      atOrAfter: latest ?? '',
      limit: 100,
    })
    latest = names.at(-1) ?? latest

    if (names.length < 100) {
      return latest
    }
  }
}

/** Validate the full replacement before publishing; failure leaves the previous cache intact. */
export async function buildSnapshot(ctx: ActionCtx, scanId: string): Promise<OrcaPublicApiV2> {
  const text = await load(ctx, { path: 'scans', name: scanId })

  if (text === null) {
    throw new ConvexError(`Public API scan missing: ${scanId}`)
  }

  const artifact = parseScanArtifact(scanId, text)

  if (
    artifactName(artifact.scan_at) !== scanId ||
    artifact.entries.some((entry) => entry.scan_at !== artifact.scan_at)
  ) {
    throw new ConvexError(`Public API scan identity mismatch: ${scanId}`)
  }

  return OrcaPublicApiV2Schema.parse({
    updated_at: artifact.scan_at,
    models: transformScanToV2Models(artifact.entries),
  })
}
