import { ConvexError } from 'convex/values'

import type { ScanArtifact } from '../scan/scanArtifact'

/**
 * Convert a `model-endpoints-v1` bundle into a scan artifact.
 *
 * `scan_at` is the bundle's `crawl_at`. Nested catalog copies are stripped the
 * same way live `scan` strips them.
 *
 * ❓ When and in what order production crawl archives are rewritten is open.
 * This function is not wired to `artifacts.store` or `ingest.register`.
 * Do not read `snapshot_crawl_archives` from here — meps2 stays isolated.
 */
export function fromModelEndpointsV1(_bundle: unknown): ScanArtifact {
  // caller will pass the grouped `{ model_id, variant, model, endpoints }` entries
  throw new ConvexError({ message: 'model-endpoints-v1 adapter is not implemented' })
}
