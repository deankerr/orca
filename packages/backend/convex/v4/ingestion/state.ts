import { withoutSystemFields } from 'convex-helpers'
import { ConvexError } from 'convex/values'

import type { Id } from '../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import { nextPair } from '../scan'
import type { ScanPair } from '../scan'
import { assertScanPair } from '../scan/time'
import { currentScanAt } from './clock'
import { V4_INGESTIONS_TABLE } from './table'
import type { Ingestion, IngestionRow } from './table'

/** Claim ready work, or discover and claim the next pair in the same transaction. */
export async function claimNext(ctx: MutationCtx): Promise<Ingestion | null> {
  const unfinished = await findUnfinished(ctx)
  let ingestion: Ingestion

  if (unfinished === null) {
    const pair = await nextPair(ctx, await currentScanAt(ctx))
    if (pair === null) {
      return null
    }
    ingestion = await createReadyIngestion(ctx, pair)
  } else {
    if (unfinished.status !== 'ready') {
      return null
    }
    ingestion = { ...withoutSystemFields(unfinished), id: unfinished._id }
  }

  await ctx.db.patch(V4_INGESTIONS_TABLE, ingestion.id, { status: 'running' })
  return { ...ingestion, status: 'running' }
}

/** Both explicit preparation and routine discovery occupy the same single slot. */
export async function createReadyIngestion(ctx: MutationCtx, pair: ScanPair): Promise<Ingestion> {
  assertScanPair(pair.from_scan_at, pair.scan_at)
  const unfinished = await findUnfinished(ctx)
  if (unfinished !== null) {
    throw new ConvexError({
      message: 'An unfinished ingestion already exists',
      ingestionId: unfinished._id,
      status: unfinished.status,
    })
  }

  const clock = await currentScanAt(ctx)
  if (clock !== null && pair.from_scan_at !== clock) {
    throw new ConvexError('Ingestion must start at the completed clock')
  }

  const row: IngestionRow = { ...pair, phase: 'initial', status: 'ready', baseline: clock === null }
  const id = await ctx.db.insert(V4_INGESTIONS_TABLE, row)
  return { id, ...row }
}

/** An attempt that exits without the final commit failed; durable completion stays complete. */
export async function finishAttempt(
  ctx: MutationCtx,
  id: Id<typeof V4_INGESTIONS_TABLE>,
): Promise<null> {
  const ingestion = await ctx.db.get(V4_INGESTIONS_TABLE, id)
  if (ingestion?.status === 'running') {
    await ctx.db.patch(V4_INGESTIONS_TABLE, id, { status: 'failed' })
  }
  return null
}

async function findUnfinished(ctx: QueryCtx) {
  for (const status of ['ready', 'running', 'failed'] as const) {
    const ingestion = await ctx.db
      .query(V4_INGESTIONS_TABLE)
      .withIndex('by_status_and_scan_at', (q) => q.eq('status', status))
      .unique()
    if (ingestion !== null) {
      return ingestion
    }
  }
  return null
}
