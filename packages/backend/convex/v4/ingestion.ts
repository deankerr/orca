import { ConvexError, v } from 'convex/values'

import { internal } from '../_generated/api'
import { internalAction } from '../_generated/server'
import type { ActionCtx } from '../_generated/server'
import { nextScanArtifactId } from '../scan/artifact'
import { COMPLETE_PHASE, isBaselinePhase } from './ingestion/phases'
import { consume } from './ingestion/step'
import { prepareBaseline, prepareForward } from './projections/compare'
import { loadArtifactEntities } from './scan'
import { artifactName, assertScanPair } from './scan/time'

type Pair = { from_scan_at: string; scan_at: string }
type Artifacts = { fromArtifactId: string; toArtifactId: string }

/** Ingest one existing artifact pair, resuming unfinished work before discovering another pair. */
export const run = internalAction({
  args: { from_scan_at: v.optional(v.string()), scan_at: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const artifacts = await selectPair(ctx, args)

    if (artifacts === null) {
      console.log('v4 ingest: no scan pair available')
      return null
    }

    const previous = await loadArtifactEntities(ctx, artifacts.fromArtifactId)
    const next = await loadArtifactEntities(ctx, artifacts.toArtifactId)
    const pair = { from_scan_at: previous.scan_at, scan_at: next.scan_at }
    assertScanPair(pair.from_scan_at, pair.scan_at)
    const forward = prepareForward(previous, next)
    const ingestion = await ctx.runMutation(internal.v4.ingestion.log.admit, pair)

    if (ingestion.phase === COMPLETE_PHASE) {
      return null
    }

    if (isBaselinePhase(ingestion.phase)) {
      ingestion.phase = await consume(ctx, ingestion, prepareBaseline(previous))
    }

    await consume(ctx, ingestion, forward)
    console.log('v4 ingest complete', pair)
    return null
  },
})

async function selectPair(ctx: ActionCtx, requested: Partial<Pair>): Promise<Artifacts | null> {
  if (requested.from_scan_at !== undefined || requested.scan_at !== undefined) {
    if (requested.from_scan_at === undefined || requested.scan_at === undefined) {
      throw new ConvexError('A scan pair needs both from_scan_at and scan_at')
    }
    assertScanPair(requested.from_scan_at, requested.scan_at)
    return {
      fromArtifactId: artifactName(requested.from_scan_at),
      toArtifactId: artifactName(requested.scan_at),
    }
  }

  const active = await ctx.runQuery(internal.v4.ingestion.log.active, {})
  if (active !== null) {
    return {
      fromArtifactId: artifactName(active.from_scan_at),
      toArtifactId: artifactName(active.scan_at),
    }
  }

  const clock = await ctx.runQuery(internal.v4.ingestion.clock.current, {})
  const fromId = clock === null ? await nextScanArtifactId(ctx, '') : artifactName(clock)
  if (fromId === null) {
    return null
  }

  const toId = await nextScanArtifactId(ctx, fromId)
  if (toId === null) {
    return null
  }

  return { fromArtifactId: fromId, toArtifactId: toId }
}
