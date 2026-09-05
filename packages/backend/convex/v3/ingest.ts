import { v } from 'convex/values'

import { internal } from '../_generated/api'
import { internalAction, internalQuery } from '../_generated/server'
import { loadScanArtifact, nextScanArtifactId } from '../scan/artifact'
import { INITIAL_SCAN_ARTIFACT_ID, V3_SCAN_INGESTIONS_TABLE } from './ingestions.table'
import { createScanProjection } from './projections/create'
import type { ScanProjection } from './projections/create'
import { diffScanProjections } from './projections/diff'

const initialProjection: ScanProjection = {
  scan_at: '',
  models: new Map(),
  providers: new Map(),
  endpoints: new Map(),
  prices: new Map(),
  stats: [],
}

export const currentArtifactId = internalQuery({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const latest = await ctx.db.query(V3_SCAN_INGESTIONS_TABLE).order('desc').first()
    return latest?.to_artifact_id ?? INITIAL_SCAN_ARTIFACT_ID
  },
})

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
    let previous = initialProjection

    if (fromArtifactId !== INITIAL_SCAN_ARTIFACT_ID) {
      const previousArtifact = await loadScanArtifact(ctx, fromArtifactId)
      previous = createScanProjection(previousArtifact)
    }

    console.log(`ingest: ${fromArtifactId} to ${toArtifactId}`)
    await ctx.runMutation(internal.v3.projections.apply.run, {
      fromArtifactId,
      toArtifactId,
      writes: diffScanProjections(previous, next),
    })

    await ctx.scheduler.runAfter(0, internal.v3.ingest.run, {})
    return null
  },
})
