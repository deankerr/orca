import { rejects } from 'node:assert/strict'

import { drainScheduledFunctions } from '@orca/config/testing'
import { afterEach, beforeEach, expect, vi, test } from 'vitest'

import { internal } from '#generated/api'

import { setup } from '../harness.testing'
import type { Harness } from '../harness.testing'
import { expectIngestionInvariants } from './invariants.testing'
import { hour } from './operators/testing'
import { writeRecords } from './records'
import { INGESTION_RECORDS_TABLE } from './tables'
import type { RecordState } from './tables'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(Date.parse(hour(1000)))
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

const STATES: RecordState[] = ['complete', 'failed', 'pending']

/** More pairs than one rebuild page, written past the aggregate so its counts are missing. */
async function seedUncounted(t: Harness, total: number) {
  await t.run(async (ctx) => {
    for (let index = 1; index <= total; index += 1) {
      await ctx.db.insert(INGESTION_RECORDS_TABLE, {
        alerts: false,
        from_scan_at: hour(index - 1),
        kind: 'pair',
        scan_at: hour(index),
        state: STATES[index % STATES.length] ?? 'complete',
      })
    }
  })
}

test('rebuild restores counts that disagree with the table, across pages', async () => {
  const t = setup()
  await seedUncounted(t, 450)
  expect(await t.query(internal.ingestion.records.counts, {})).toMatchObject({ 'pair/complete': 0 })

  await t.mutation(internal.ingestion.records.rebuildCounts, {})
  await drainScheduledFunctions(t)

  const expected = (state: RecordState) =>
    Array.from({ length: 450 }, (_, index) => STATES[(index + 1) % STATES.length]).filter(
      (candidate) => candidate === state,
    ).length

  expect(await t.query(internal.ingestion.records.counts, {})).toMatchObject({
    'pair/complete': expected('complete'),
    'pair/failed': expected('failed'),
    'pair/pending': expected('pending'),
    'pair/queued': 0,
  })
  await expectIngestionInvariants(t, { receipts: false })
})

test('rebuild discards stale counts instead of adding to them', async () => {
  const t = setup()
  await t.run(async (ctx) => {
    await writeRecords(ctx, async (records) => {
      await records.insert({
        alerts: false,
        from_scan_at: hour(0),
        kind: 'pair',
        scan_at: hour(1),
        state: 'complete',
      })
    })
  })
  await drainScheduledFunctions(t)

  await t.mutation(internal.ingestion.records.rebuildCounts, {})
  await drainScheduledFunctions(t)

  expect(await t.query(internal.ingestion.records.counts, {})).toMatchObject({ 'pair/complete': 1 })
  await expectIngestionInvariants(t, { receipts: false })
})

test('rebuild refuses while a record is queued or withdrawing', async () => {
  const t = setup()

  for (const state of ['queued', 'withdrawing'] as const) {
    const id = await t.run(
      async (ctx) =>
        await ctx.db.insert(INGESTION_RECORDS_TABLE, {
          alerts: false,
          from_scan_at: hour(0),
          kind: 'pair',
          scan_at: hour(1),
          state,
        }),
    )

    await rejects(t.mutation(internal.ingestion.records.rebuildCounts, {}), new RegExp(state, 'u'))
    await t.run(async (ctx) => {
      await ctx.db.delete(INGESTION_RECORDS_TABLE, id)
    })
  }
})

test('rebuild refuses while the cron is enabled', async () => {
  const t = setup()
  vi.stubEnv('ORCA_INGESTION_CRON_ENABLED', 'true')

  await rejects(
    t.mutation(internal.ingestion.records.rebuildCounts, {}),
    /Disable ORCA_INGESTION_CRON_ENABLED/u,
  )
})

test('rebuild refuses while aggregate operations are pending', async () => {
  const t = setup()
  await t.run(async (ctx) => {
    await writeRecords(ctx, async (records) => {
      await records.insert({
        alerts: false,
        from_scan_at: hour(0),
        kind: 'pair',
        scan_at: hour(1),
        state: 'complete',
      })
    })
  })

  await rejects(
    t.mutation(internal.ingestion.records.rebuildCounts, {}),
    /PENDING_OPERATIONS|pending/iu,
  )
})

test('exists reads the table, not the aggregate counts', async () => {
  const t = setup()
  expect(await t.query(internal.ingestion.records.exists, {})).toBe(false)

  await seedUncounted(t, 1)
  expect(await t.query(internal.ingestion.records.exists, {})).toBe(true)
})
