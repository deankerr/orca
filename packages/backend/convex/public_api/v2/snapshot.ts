import { ConvexError } from 'convex/values'

import type { ActionCtx } from '../../_generated/server'
import { loadRaw } from '../../scan'
import { transformScanToV2Models } from './compatibility'
import { OrcaPublicApiV2Schema } from './schema'
import type { OrcaPublicApiV2 } from './schema'

/** Validate the full replacement before publishing; failure leaves the previous cache intact. */
export async function buildSnapshot(ctx: ActionCtx, scanAt: string): Promise<OrcaPublicApiV2> {
  const scan = await loadRaw(ctx, scanAt)

  const snapshot = OrcaPublicApiV2Schema.parse({
    updated_at: scan.scan_at,
    models: transformScanToV2Models(scan.entries),
  })

  // An empty upstream result must not erase the last usable public snapshot.
  if (snapshot.models.length === 0) {
    throw new ConvexError(`Public API scan has no usable endpoints: ${scanAt}`)
  }

  return snapshot
}
