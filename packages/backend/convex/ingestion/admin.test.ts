import { rejects } from 'node:assert/strict'

import { drainScheduledFunctions } from '@orca/config/testing'
import { afterEach, beforeEach, expect, vi, test } from 'vitest'

import { api } from '#generated/api'

import { setup } from '../harness.testing'
import type { Harness } from '../harness.testing'
import { hour } from './operators/testing'
import { writeRecords } from './records'
import type { RecordState } from './tables'

const ADMIN = 'user_admin'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(Date.parse(hour(48)))
  vi.stubEnv('ORCA_ADMIN_USER_ID', ADMIN)
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()

  vi.unstubAllEnvs()
})

const STATES: RecordState[] = ['complete', 'complete', 'failed', 'pending', 'queued']

/** Pairs at hours 1–40, cycling through states, with the aggregate's queue drained. */
async function seed(t: Harness) {
  await t.run(async (ctx) => {
    await writeRecords(ctx, async (records) => {
      for (let index = 1; index <= 40; index += 1) {
        await records.insert({
          alerts: false,
          from_scan_at: hour(index - 1),
          kind: 'pair',
          scan_at: hour(index),
          state: STATES[index % STATES.length] ?? 'complete',
        })
      }
    })
  })
  await drainScheduledFunctions(t)
}

test('every operation requires the configured administrator', async () => {
  const t = setup()
  const other = t.withIdentity({ subject: 'user_other' })

  await rejects(other.query(api.ingestion.admin.overview, {}), /Administrator access required/u)
  await rejects(other.mutation(api.ingestion.admin.runSync, {}), /Administrator access required/u)
  await rejects(other.mutation(api.ingestion.admin.retry, {}), /Administrator access required/u)
  await rejects(
    t.mutation(api.ingestion.admin.saveTarget, { end_at: hour(1), start_at: hour(0) }),
    /Administrator access required/u,
  )
})

test('histogram buckets count each state exactly, including the inclusive range end', async () => {
  const t = setup()
  await seed(t)
  const admin = t.withIdentity({ subject: ADMIN })

  const { edges, counts } = await admin.query(api.ingestion.admin.histogram, {
    buckets: 8,
    end_at: hour(40),
    start_at: hour(0),
  })

  expect(edges).toHaveLength(9)

  for (const state of new Set(STATES)) {
    const expected = Array.from({ length: 8 }, (_, bucket) => {
      const indexes = Array.from({ length: 40 }, (_entry, i) => i + 1).filter((index) =>
        bucket === 7 ? index >= bucket * 5 : index >= bucket * 5 && index < (bucket + 1) * 5,
      )

      return indexes.filter((index) => STATES[index % STATES.length] === state).length
    })

    expect(counts[state]).toEqual(expected)
  }

  const { counts: totals } = await admin.query(api.ingestion.admin.overview, {})
  expect(totals['pair/complete']).toBe(16)
  expect(totals['pair/failed']).toBe(8)

  await rejects(
    admin.query(api.ingestion.admin.histogram, { buckets: 4, end_at: hour(0), start_at: hour(1) }),
    /Invalid histogram/u,
  )
  await rejects(
    admin.query(api.ingestion.admin.histogram, {
      buckets: 10_000,
      end_at: hour(1),
      start_at: hour(0),
    }),
    /Invalid histogram/u,
  )
})

test('records page newest first, filtered by state, from a chosen time', async () => {
  const t = setup()
  await seed(t)
  const admin = t.withIdentity({ subject: ADMIN })
  const paginationOpts = { cursor: null, numItems: 3 }

  const all = await admin.query(api.ingestion.admin.records, { paginationOpts })
  expect(all.page.map(({ scan_at }) => scan_at)).toEqual([hour(40), hour(39), hour(38)])

  await t.run(async (ctx) => {
    await writeRecords(ctx, async (records) => {
      await records.insert({
        alerts: false,
        from_scan_at: null,
        kind: 'baseline',
        scan_at: hour(14),
        state: 'failed',
      })
    })
  })

  // A state filter includes baselines in scan order.
  const failed = await admin.query(api.ingestion.admin.records, {
    before: hour(20),
    paginationOpts,
    state: 'failed',
  })

  expect(failed.page.map(({ kind, scan_at }) => [kind, scan_at])).toEqual([
    ['pair', hour(17)],
    ['baseline', hour(14)],
    ['pair', hour(12)],
  ])

  const next = await admin.query(api.ingestion.admin.records, {
    before: hour(20),
    paginationOpts: { cursor: failed.continueCursor, numItems: 3 },
    state: 'failed',
  })

  expect(next.page.map(({ scan_at }) => scan_at)).toEqual([hour(7), hour(2)])
})

test('retry reopens failed records and reports how many', async () => {
  const t = setup()
  await seed(t)
  const admin = t.withIdentity({ subject: ADMIN })

  expect(await admin.mutation(api.ingestion.admin.retry, {})).toBe(8)
  expect(await admin.mutation(api.ingestion.admin.retry, {})).toBe(0)
})
