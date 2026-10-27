import { drainScheduledFunctions } from '@orca/config/testing'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { internal } from '#generated/api'
import * as scans from '#scans'

import { CURRENT_ENDPOINTS_TABLE } from '../../catalog/tables/current'
import type { CurrentEndpointRow } from '../../catalog/tables/current'
import { setup } from '../../harness.testing'
import { JsonObjectFromString } from '../../json'
import { endpointRow } from '../operators/currentEndpoints'
import { hour, rawScan, scan } from '../operators/testing'
import type { ScanSpec } from '../operators/testing'

const CREATED = '2025-12-01T00:00:00.000Z'

const SPECS = [
  { endpoints: { early: { model: 'm1', provider: 'p1' } } },
  { endpoints: { late: { created: CREATED, model: 'm1', provider: 'p2' } } },
  { endpoints: {} },
]

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/** More departures at one scan than a page holds. */
const MANY = Array.from({ length: 150 }, (_, index) => `e${index}`)

/** A row unlisted at `unlistedAt`, as stored before creation times were retained. */
function staleRow(id: string, unlistedAt: string) {
  const endpoint = scan(hour(0), {
    endpoints: { [id]: { model: 'm1', provider: 'p1' } },
  }).endpoints.get(id)

  if (endpoint === undefined) {
    throw new Error(`Missing endpoint ${id}`)
  }

  return endpointRow(endpoint, { scan_at: unlistedAt, unlisted_at: unlistedAt })
}

async function refresh(t: ReturnType<typeof setup>, specs: ScanSpec[], rows: CurrentEndpointRow[]) {
  await t.action(async (ctx) => {
    for (const [index, spec] of specs.entries()) {
      await scans.store(ctx, rawScan(hour(index), spec))
    }
  })

  await t.run(async (ctx) => {
    for (const row of rows) {
      await ctx.db.insert(CURRENT_ENDPOINTS_TABLE, row)
    }
  })

  await t.mutation(internal.ingestion.catalog.refreshUnlistedEndpoints.run, { atOrAfter: hour(0) })
  await drainScheduledFunctions(t)

  const stored = await t.run(async (ctx) => await ctx.db.query(CURRENT_ENDPOINTS_TABLE).collect())

  return new Map(
    stored.map((row) => [row.endpoint_id, JsonObjectFromString.parse(row.metadata_json)]),
  )
}

test('refresh restates unlisted rows from the scan before each unlisting', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

  // `early` has no earlier scan to restate from.
  const metadata = await refresh(setup(), SPECS, [
    staleRow('early', hour(0)),
    staleRow('late', hour(2)),
  ])

  expect(metadata.get('late')).toMatchObject({ created_at: CREATED })
  expect(metadata.get('early')).not.toHaveProperty('created_at')
  expect(log).toHaveBeenCalledWith('Refreshed unlisted endpoints', {
    missing: ['early'],
    read: 2,
    restated: 1,
  })
})

test('refresh pages through more unlistings than one page holds', async () => {
  const present = Object.fromEntries(
    MANY.map((id) => [id, { created: CREATED, model: 'm1', provider: 'p1' }]),
  )

  vi.spyOn(console, 'log').mockImplementation(() => undefined)

  const metadata = await refresh(
    setup(),
    [{ endpoints: present }, { endpoints: {} }],
    MANY.map((id) => staleRow(id, hour(1))),
  )

  expect(MANY.filter((id) => metadata.get(id)?.created_at === CREATED)).toEqual(MANY)
})

test('restating skips rows whose unlisting changed since the read', async () => {
  const t = setup()

  const id = await t.run(
    async (ctx) => await ctx.db.insert(CURRENT_ENDPOINTS_TABLE, staleRow('late', hour(3))),
  )

  const restated = await t.mutation(internal.ingestion.catalog.refreshUnlistedEndpoints.restate, {
    restatements: [{ _id: id, row: staleRow('late', hour(2)) }],
  })

  expect(restated).toBe(0)
})
