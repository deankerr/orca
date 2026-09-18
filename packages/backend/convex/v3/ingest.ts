import { v } from 'convex/values'

import { internal } from '../_generated/api'
import { env, internalAction, internalQuery } from '../_generated/server'
import { prepareComparison } from '../projections/documents'
import { nextScanArtifactId } from '../scan/artifact'
import { consume as consumeViews } from '../views/consume'
import { getCurrentScan } from './ingestions'
import { INITIAL_SCAN_ARTIFACT_ID } from './ingestions.table'

/** Return the artifact ID at the current scan. */
export const currentArtifactId = internalQuery({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const latest = await getCurrentScan(ctx)
    return latest?.to_artifact_id ?? INITIAL_SCAN_ARTIFACT_ID
  },
})

/** Ingest the next stored scan artifact; optionally stop after this one. */
export const run = internalAction({
  args: { once: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, { once }) => {
    const fromArtifactId: string = await ctx.runQuery(internal.v3.ingest.currentArtifactId, {})
    const toArtifactId = await nextScanArtifactId(ctx, fromArtifactId)

    if (toArtifactId === null) {
      console.log('no new scan artifacts available')
      return null
    }

    const comparison = await prepareComparison(
      ctx,
      fromArtifactId === INITIAL_SCAN_ARTIFACT_ID ? null : fromArtifactId,
      toArtifactId,
    )

    console.log(`ingest: ${fromArtifactId} to ${toArtifactId}`)

    await consumeViews(ctx, comparison)
    await ctx.runMutation(internal.v3.ingestions.complete, {
      from_artifact_id: fromArtifactId,
      to_artifact_id: toArtifactId,
      scan_at: comparison.next.scan_at,
    })

    if (once !== true) {
      await ctx.scheduler.runAfter(0, internal.v3.ingest.run, {})
    }
    return null
  },
})

/** Opt-in hourly ingestion, independent of scan scheduling. */
export const scheduled = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (env.ORCA_INGEST_ENABLED === 'true') {
      await ctx.runAction(internal.v3.ingest.run, {})
    }

    return null
  },
})
