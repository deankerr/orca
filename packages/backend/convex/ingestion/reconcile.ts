import { vWorkId } from '@convex-dev/workpool'
import { v } from 'convex/values'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'
import type { MutationCtx } from '#generated/server'

import { pool } from './pool'
import { requestQueueStep } from './queue'
import { writeRecords } from './records'
import { INGESTION_RECORDS_TABLE, recordKind } from './tables'
import type { RecordKind } from './tables'

/** Most accepted records read per kind and state, comfortably above `queueCapacity()`'s ceiling. */
const SWEEP_LIMIT = 512

/**
 * Workpool deletes failed work and schedules its completion in one transaction, so a finished
 * record that is still accepted is briefly normal. Confirm only after that completion had time to run.
 */
const GRACE_MS = 5 * 60 * 1000

const ACCEPTED = ['queued', 'withdrawing'] as const

/** Schedule a sweep from a cron or admin transaction, keeping their own work small. */
export async function requestSweep(ctx: MutationCtx) {
  await ctx.scheduler.runAfter(0, internal.ingestion.reconcile.sweep, {})
}

/**
 * Find accepted records whose Workpool work has finished and schedule a delayed confirmation for
 * each. Reads are bounded; a larger backlog is found by later sweeps.
 */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const groups = await Promise.all(
      recordKind.members.flatMap(({ value: kind }) =>
        ACCEPTED.map(async (state) => await accepted(ctx, kind, state)),
      ),
    )

    const records = groups.flat()

    const suspects = records.flatMap((record) =>
      record.work_id === undefined ? [] : [{ record, work_id: record.work_id }],
    )

    const statuses = await pool().statusBatch(
      ctx,
      suspects.map(({ work_id }) => work_id),
    )

    await Promise.all(
      suspects.flatMap(({ record, work_id }, index) =>
        statuses[index]?.state === 'finished'
          ? [
              ctx.scheduler.runAfter(GRACE_MS, internal.ingestion.reconcile.confirmLost, {
                record_id: record._id,
                work_id,
              }),
            ]
          : [],
      ),
    )

    return null
  },
  returns: v.null(),
})

/**
 * Fail a record whose work finished without settling it. A late settlement still finds the record
 * by work ID and overwrites the state, so this is safe against slow completions.
 */
export const confirmLost = internalMutation({
  args: { record_id: v.id(INGESTION_RECORDS_TABLE), work_id: vWorkId },
  handler: async (ctx, { record_id, work_id }) => {
    const record = await ctx.db.get(INGESTION_RECORDS_TABLE, record_id)

    // A settled or retried record no longer waits on this work.
    if (
      record === null ||
      record.work_id !== work_id ||
      (record.state !== 'queued' && record.state !== 'withdrawing')
    ) {
      return null
    }

    const status = await pool().status(ctx, work_id)

    if (status.state !== 'finished') {
      return null
    }

    const error = 'Completion lost: Workpool work finished without settling the record'

    console.error('[ingestion] completion lost', { record: record._id, scan_at: record.scan_at })
    await writeRecords(ctx, async (records) => {
      await records.patch(record, { error, state: 'failed' })
    })
    await requestQueueStep(ctx)

    return null
  },
  returns: v.null(),
})

async function accepted(ctx: MutationCtx, kind: RecordKind, state: (typeof ACCEPTED)[number]) {
  return await ctx.db
    .query(INGESTION_RECORDS_TABLE)
    .withIndex('by_kind_and_state_and_scan_at', (q) => q.eq('kind', kind).eq('state', state))
    .take(SWEEP_LIMIT)
}
