import type { WorkId } from '@convex-dev/workpool'
import { drainScheduledFunctions } from '@orca/config/testing'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { internal } from '#generated/api'
import type { Id } from '#generated/dataModel'

import { setup } from '../harness.testing'
import type { Harness } from '../harness.testing'
import { expectIngestionInvariants } from './invariants.testing'
import { hour } from './operators/testing'
import { pool } from './pool'
import { writeRecords } from './records'
import { INGESTION_RECORDS_TABLE } from './tables'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(Date.parse(hour(48)))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllTimers()
  vi.useRealTimers()
})

/** Enqueue real Workpool work; the completion finds no record, so nothing settles. */
async function enqueue(t: Harness) {
  return await t.run(
    async (ctx) =>
      await pool().enqueueAction(
        ctx,
        internal.ingestion.execute.withdraw,
        { scan_at: hour(9) },
        { onComplete: internal.ingestion.execute.onWithdrawn },
      ),
  )
}

async function insertQueued(t: Harness, work_id: WorkId) {
  return await t.run(
    async (ctx) =>
      await writeRecords(
        ctx,
        async (writer) =>
          await writer.insert({
            alerts: false,
            from_scan_at: hour(0),
            kind: 'pair',
            scan_at: hour(1),
            state: 'queued',
            work_id,
          }),
      ),
  )
}

async function scheduledCalls(t: Harness, name: string) {
  return await t.run(async (ctx) => {
    const all = await ctx.db.system.query('_scheduled_functions').collect()
    return all.filter((fn) => fn.name === name).length
  })
}

async function record(t: Harness, id: Id<typeof INGESTION_RECORDS_TABLE>) {
  return await t.run(async (ctx) => await ctx.db.get(INGESTION_RECORDS_TABLE, id))
}

/** A work ID whose Workpool work has finished and been deleted. */
async function finishedWork(t: Harness) {
  const workId = await enqueue(t)
  await drainScheduledFunctions(t)
  return workId
}

test('a queued record whose work is still pending is left alone', async () => {
  const t = setup()
  const id = await insertQueued(t, await enqueue(t))

  await t.mutation(internal.ingestion.reconcile.sweep, {})

  expect(await scheduledCalls(t, 'ingestion/reconcile:confirmLost')).toBe(0)
  const untouched = await record(t, id)
  expect(untouched?.state).toBe('queued')
})

test('a record whose work finished without settling it fails after the grace period', async () => {
  const t = setup()
  const id = await insertQueued(t, await finishedWork(t))

  const sweptAt = Date.now()
  await t.mutation(internal.ingestion.reconcile.sweep, {})
  const confirmations = await t.run(
    async (ctx) =>
      await ctx.db.system
        .query('_scheduled_functions')
        .filter((q) => q.eq(q.field('name'), 'ingestion/reconcile:confirmLost'))
        .collect(),
  )
  // Normal completions get five minutes to settle before the record is judged lost.
  expect(confirmations).toHaveLength(1)
  const delay = (confirmations[0]?.scheduledTime ?? 0) - sweptAt
  expect(delay).toBeGreaterThanOrEqual(5 * 60 * 1000)
  expect(delay).toBeLessThan(5 * 60 * 1000 + 1000)
  const waiting = await record(t, id)
  expect(waiting?.state).toBe('queued')

  await drainScheduledFunctions(t)

  const failed = await record(t, id)
  expect(failed?.state).toBe('failed')
  expect(failed?.error).toMatch(/Completion lost/u)
  expect(await scheduledCalls(t, 'ingestion/queue:wake')).toBe(1)
  await expectIngestionInvariants(t, { receipts: false })
})

test('a record settled or retried during the grace period is left alone', async () => {
  const t = setup()
  const settled = await insertQueued(t, await finishedWork(t))
  const retried = await insertQueued(t, await finishedWork(t))

  await t.mutation(internal.ingestion.reconcile.sweep, {})
  expect(await scheduledCalls(t, 'ingestion/reconcile:confirmLost')).toBe(2)

  await t.run(async (ctx) => {
    await writeRecords(ctx, async (writer) => {
      const first = await ctx.db.get(INGESTION_RECORDS_TABLE, settled)
      const second = await ctx.db.get(INGESTION_RECORDS_TABLE, retried)
      if (first === null || second === null) {
        throw new Error('Records missing')
      }
      await writer.patch(first, { state: 'complete' })
      await writer.patch(second, { state: 'pending', work_id: undefined })
    })
  })
  await drainScheduledFunctions(t)

  const settledRecord = await record(t, settled)
  const retriedRecord = await record(t, retried)
  expect(settledRecord?.state).toBe('complete')
  expect(retriedRecord?.state).toBe('pending')
  expect(retriedRecord?.error).toBeUndefined()
  await expectIngestionInvariants(t, { receipts: false })
})
