import type { Infer } from 'convex/values'
import { ConvexError, getDocumentSize, v } from 'convex/values'

import { internal } from '../_generated/api'
import { env, internalAction, internalMutation, internalQuery } from '../_generated/server'
import type { ActionCtx } from '../_generated/server'
import type { ScanComparison } from '../projections'
import { prepareComparison } from '../projections/documents'
import { nextScanArtifactId } from '../scan/artifact'
import { INITIAL_SCAN_ARTIFACT_ID } from '../v3/ingestions.table'
import { extractChangeEventInputs } from './ingestion/extract'
import { CHANGE_EVENT_INGESTIONS_TABLE, changeEventIngestionsTable } from './schema'
import type { entityChangeFields } from './schema'

/** Temporary continuation hint: newest receipt, or the baseline for the latest stored pair. */
export const currentArtifactId = internalQuery({
  args: {},
  returns: v.union(v.null(), v.string()),
  handler: async (ctx): Promise<string | null> => {
    const latest = await ctx.db
      .query(CHANGE_EVENT_INGESTIONS_TABLE)
      .withIndex('by_to_artifact_id')
      .order('desc')
      .first()

    if (latest !== null) {
      // ponytail: newest receipt can leave historical gaps; rerun with an explicit baseline to fill them.
      return latest.to_artifact_id
    }

    const newest: string | null = await ctx.runQuery(internal.objects.locators.previousName, {
      path: 'scans',
    })
    return newest === null
      ? null
      : await ctx.runQuery(internal.objects.locators.previousName, {
          path: 'scans',
          beforeName: newest,
        })
  },
})

/** Temporary per-comparison receipt; completion order is independent of observation order. */
export const complete = internalMutation({
  args: changeEventIngestionsTable.validator,
  returns: v.null(),
  handler: async (ctx, scan) => {
    const existing = await ctx.db
      .query(CHANGE_EVENT_INGESTIONS_TABLE)
      .withIndex('by_to_artifact_id', (q) => q.eq('to_artifact_id', scan.to_artifact_id))
      .unique()

    if (existing !== null) {
      if (
        existing.from_artifact_id !== scan.from_artifact_id ||
        existing.scan_at !== scan.scan_at
      ) {
        throw new ConvexError('Retry changed a completed change event comparison')
      }

      return null
    }

    await ctx.db.insert(CHANGE_EVENT_INGESTIONS_TABLE, scan)
    return null
  },
})

/** Temporary production-prototype runner; invoke manually, optionally stopping after one artifact. */
export const run = internalAction({
  args: {
    afterArtifactId: v.optional(v.string()),
    once: v.optional(v.boolean()),
    process: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { afterArtifactId, once, process = false }) => {
    const fromArtifactId: string | null =
      afterArtifactId ?? (await ctx.runQuery(internal.changeEvents.ingestion.currentArtifactId, {}))

    if (fromArtifactId === null) {
      console.log('not enough scan artifacts for a comparison')
      return null
    }

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

    console.log(`CES ingest: ${fromArtifactId} to ${toArtifactId}`)
    await ingestComparison(ctx, comparison)

    if (process) {
      await ctx.runAction(internal.changeEvents.processing.processPendingInputs, {
        scan_at: comparison.next.scan_at,
      })
    }

    await ctx.runMutation(internal.changeEvents.ingestion.complete, {
      from_artifact_id: fromArtifactId,
      to_artifact_id: toArtifactId,
      scan_at: comparison.next.scan_at,
    })

    if (once !== true) {
      await ctx.scheduler.runAfter(0, internal.changeEvents.ingestion.run, {
        afterArtifactId: toArtifactId,
        process,
      })
    }

    return null
  },
})

/** Temporary production-prototype cron; disabled unless explicitly enabled. */
export const scheduled = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (env.ORCA_CES_INGEST_ENABLED === 'true') {
      await ctx.runAction(internal.changeEvents.ingestion.run, { process: true })
    }

    return null
  },
})

// A quarter of Convex's 16 MiB transaction budget leaves room for argument encoding and retries.
const WRITE_BYTES = 4 * 1024 * 1024
// Each input performs one indexed lookup; Convex allows 4096 index ranges per transaction.
const WRITE_INDEX_RANGES = 4096

/**
 * Retain a prepared comparison in independently committed, retry-safe batches.
 * Earlier batches survive a later failure; the caller advances ingestion only after all succeed.
 * Source loading and processing cadence belong to callers.
 */
export async function ingestComparison(
  ctx: Pick<ActionCtx, 'runMutation'>,
  comparison: ScanComparison,
) {
  let inputs: Infer<typeof entityChangeFields>[] = []
  let batchBytes = 0
  let totalBytes = 0
  let maxBytes = 0
  let count = 0

  // Budget complete stored inputs, including processing state and estimated system fields.
  for (const input of extractChangeEventInputs(comparison)) {
    const bytes = getDocumentSize({ ...input, processed: false })
    // Commit the preceding batch before this input would cross a transaction budget.
    // Inputs stay indivisible; Convex rejects a document exceeding its own size limit.
    if (
      inputs.length > 0 &&
      (batchBytes + bytes > WRITE_BYTES || inputs.length === WRITE_INDEX_RANGES)
    ) {
      await ctx.runMutation(internal.changeEvents.ingestion.store.storeChangeEventInputs, {
        inputs,
      })

      inputs = []
      batchBytes = 0
    }

    inputs.push(input)
    batchBytes += bytes
    totalBytes += bytes
    maxBytes = Math.max(maxBytes, bytes)
    count += 1
  }

  // Finish the tail before the caller can record completion, including an empty comparison.
  if (inputs.length > 0) {
    await ctx.runMutation(internal.changeEvents.ingestion.store.storeChangeEventInputs, { inputs })
  }
  // These describe submitted inputs, including retries, rather than newly inserted rows.
  console.log('Change event inputs accepted', {
    from_scan_at: comparison.previous.scan_at,
    scan_at: comparison.next.scan_at,
    inputs: count,
    totalBytes,
    maxBytes,
  })
}
