import { v } from 'convex/values'

import { internal } from '../_generated/api'
import { internalAction, internalQuery } from '../_generated/server'
import { loadScanArtifact, nextScanArtifactId } from '../scan/artifact'
import { getCurrentScan } from './ingestions'
import { INITIAL_SCAN_ARTIFACT_ID } from './ingestions.table'
import { applyScanProjection } from './projections/apply'
import { createScanProjection, INITIAL_SCAN_PROJECTION } from './projections/create'
import { diffScanProjections } from './projections/diff'

/** Return the artifact ID at the current scan. */
export const currentArtifactId = internalQuery({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const latest = await getCurrentScan(ctx)
    return latest?.to_artifact_id ?? INITIAL_SCAN_ARTIFACT_ID
  },
})

/** Ingest the next stored scan artifact, then continue while artifacts remain. */
export const run = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // ponytail: artifact selection assumes this action is single-flight; add a cursor CAS if not.
    const fromArtifactId: string = await ctx.runQuery(internal.v3.ingest.currentArtifactId, {})
    const toArtifactId = await nextScanArtifactId(ctx, fromArtifactId)

    if (toArtifactId === null) {
      console.log('no new scan artifacts available')
      return null
    }

    const nextArtifact = await loadScanArtifact(ctx, toArtifactId)
    const next = createScanProjection(nextArtifact)
    let previous = INITIAL_SCAN_PROJECTION

    if (fromArtifactId !== INITIAL_SCAN_ARTIFACT_ID) {
      const previousArtifact = await loadScanArtifact(ctx, fromArtifactId)
      previous = createScanProjection(previousArtifact)
    }

    console.log(`ingest: ${fromArtifactId} to ${toArtifactId}`)

    await applyScanProjection(ctx, {
      fromArtifactId,
      toArtifactId,
      scan_at: next.scan_at,
      writes: diffScanProjections(previous, next),
    })

    await ctx.scheduler.runAfter(0, internal.v3.ingest.run, {})
    return null
  },
})
