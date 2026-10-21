import { afterEach, beforeEach, expect, jest, test } from 'bun:test'
import { rejects } from 'node:assert/strict'

import { api } from '#generated/api'

import { setup } from '../harness.testing'
import type { Harness } from '../harness.testing'
import { hour } from './operators/testing'
import { writeRecords } from './records'
import type { RecordState } from './tables'

const ADMIN = 'user_admin'
let previous: string | undefined

beforeEach(() => {
  jest.useFakeTimers()
  previous = process.env.ORCA_ADMIN_USER_ID
  process.env.ORCA_ADMIN_USER_ID = ADMIN
})

afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()

  if (previous === undefined) {
    Reflect.deleteProperty(process.env, 'ORCA_ADMIN_USER_ID')
  } else {
    process.env.ORCA_ADMIN_USER_ID = previous
  }
})

const STATES: RecordState[] = ['complete', 'complete', 'failed', 'pending', 'queued']

/** Pairs at hours 1–40, cycling through states, with the aggregate's queue drained. */
async function seed(t: Harness) {
  await t.run(async (ctx) => {
    await writeRecords(ctx, async (records) => {
      for (let index = 1; index <= 40; index += 1) {
        await records.insert({
          kind: 'pair',
          from_scan_at: hour(index - 1),
          scan_at: hour(index),
          alerts: false,
          state: STATES[index % STATES.length] ?? 'complete',
        })
      }
    })
  })
  await t.finishAllScheduledFunctions(() => {
    jest.advanceTimersByTime(60_000)
  }, 1000)
}

test('every operation requires the configured administrator', async () => {
  const t = setup()
  const other = t.withIdentity({ subject: 'user_other' })

  await rejects(other.query(api.ingestion.admin.overview, {}), /Administrator access required/)
  await rejects(other.mutation(api.ingestion.admin.runSync, {}), /Administrator access required/)
  await rejects(other.mutation(api.ingestion.admin.retry, {}), /Administrator access required/)
  await rejects(
    t.mutation(api.ingestion.admin.saveTarget, { start_at: hour(0), end_at: hour(1) }),
    /Administrator access required/,
  )
})

test('histogram buckets count each state exactly, including the inclusive range end', async () => {
  const t = setup()
  await seed(t)
  const admin = t.withIdentity({ subject: ADMIN })

  const { edges, counts } = await admin.query(api.ingestion.admin.histogram, {
    start_at: hour(0),
    end_at: hour(40),
    buckets: 8,
  })

  expect(edges).toHaveLength(9)
  for (const state of new Set(STATES)) {
    const expected = Array.from({ length: 8 }, (_, bucket) => {
      const indexes = Array.from({ length: 40 }, (_, i) => i + 1).filter((index) =>
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
    admin.query(api.ingestion.admin.histogram, { start_at: hour(1), end_at: hour(0), buckets: 4 }),
    /Invalid histogram/,
  )
  await rejects(
    admin.query(api.ingestion.admin.histogram, {
      start_at: hour(0),
      end_at: hour(1),
      buckets: 10_000,
    }),
    /Invalid histogram/,
  )
})

test('records page newest first, filtered by state, from a chosen time', async () => {
  const t = setup()
  await seed(t)
  const admin = t.withIdentity({ subject: ADMIN })
  const paginationOpts = { numItems: 3, cursor: null }

  const all = await admin.query(api.ingestion.admin.records, { paginationOpts })
  expect(all.page.map(({ scan_at }) => scan_at)).toEqual([hour(40), hour(39), hour(38)])

  await t.run(async (ctx) => {
    await writeRecords(ctx, async (records) => {
      await records.insert({
        kind: 'baseline',
        from_scan_at: null,
        scan_at: hour(14),
        alerts: false,
        state: 'failed',
      })
    })
  })

  // A state filter includes baselines in scan order.
  const failed = await admin.query(api.ingestion.admin.records, {
    state: 'failed',
    before: hour(20),
    paginationOpts,
  })
  expect(failed.page.map(({ kind, scan_at }) => [kind, scan_at])).toEqual([
    ['pair', hour(17)],
    ['baseline', hour(14)],
    ['pair', hour(12)],
  ])

  const next = await admin.query(api.ingestion.admin.records, {
    state: 'failed',
    before: hour(20),
    paginationOpts: { numItems: 3, cursor: failed.continueCursor },
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
