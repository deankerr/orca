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
import { INGESTION_RECORDS_TABLE } from '../tables'

const CREATED = '2025-12-01T00:00:00.000Z'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/** A row written at `scanAt`, as stored before creation times were retained. */
function staleRow(id: string, version: { scan_at: string; unlisted_at?: string }) {
  const endpoint = scan(hour(0), {
    endpoints: { [id]: { model: 'm1', provider: 'p1' } },
  }).endpoints.get(id)

  if (endpoint === undefined) {
    throw new Error(`Missing endpoint ${id}`)
  }

  return endpointRow(endpoint, version)
}

/** Store one scan as the latest committed output, then refresh `rows` from it. */
async function refresh(t: ReturnType<typeof setup>, spec: ScanSpec, rows: CurrentEndpointRow[]) {
  await t.action(async (ctx) => {
    await scans.store(ctx, rawScan(hour(1), spec))
  })

  await t.run(async (ctx) => {
    await ctx.db.insert(INGESTION_RECORDS_TABLE, {
      alerts: false,
      from_scan_at: null,
      kind: 'baseline',
      scan_at: hour(1),
      state: 'complete',
    })

    for (const row of rows) {
      await ctx.db.insert(CURRENT_ENDPOINTS_TABLE, row)
    }
  })

  await t.mutation(internal.ingestion.catalog.refreshListedEndpoints.run, {})
  await drainScheduledFunctions(t)

  const stored = await t.run(async (ctx) => await ctx.db.query(CURRENT_ENDPOINTS_TABLE).collect())

  return new Map(
    stored.map((row) => [
      row.endpoint_id,
      { metadata: JsonObjectFromString.parse(row.metadata_json), scan_at: row.scan_at },
    ]),
  )
}

test('refresh restates listed rows from the latest committed scan', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

  const stored = await refresh(
    setup(),
    { endpoints: { kept: { created: CREATED, model: 'm1', provider: 'p1' } } },
    [
      staleRow('kept', { scan_at: hour(0) }),
      staleRow('absent', { scan_at: hour(0) }),
      staleRow('unlisted', { scan_at: hour(0), unlisted_at: hour(0) }),
    ],
  )

  expect(stored.get('kept')).toMatchObject({ metadata: { created_at: CREATED }, scan_at: hour(1) })
  expect(stored.get('absent')?.scan_at).toBe(hour(0))
  expect(stored.get('unlisted')?.scan_at).toBe(hour(0))
  expect(log).toHaveBeenCalledWith('Refreshed listed endpoints', {
    missing: ['absent'],
    read: 2,
    restated: 1,
  })
})

test('refresh pages through more rows than one page holds', async () => {
  const ids = Array.from({ length: 150 }, (_, index) => `e${index}`)

  const present = Object.fromEntries(
    ids.map((id) => [id, { created: CREATED, model: 'm1', provider: 'p1' }]),
  )

  vi.spyOn(console, 'log').mockImplementation(() => undefined)

  const stored = await refresh(
    setup(),
    { endpoints: present },
    ids.map((id) => staleRow(id, { scan_at: hour(0) })),
  )

  expect(ids.filter((id) => stored.get(id)?.metadata.created_at === CREATED)).toEqual(ids)
})

test('restating skips rows that changed since the read', async () => {
  const t = setup()

  const [newer, unlisted] = await t.run(
    async (ctx) =>
      await Promise.all(
        [
          staleRow('newer', { scan_at: hour(2) }),
          staleRow('unlisted', { scan_at: hour(0), unlisted_at: hour(0) }),
        ].map(async (row) => await ctx.db.insert(CURRENT_ENDPOINTS_TABLE, row)),
      ),
  )

  if (newer === undefined || unlisted === undefined) {
    throw new Error('Missing inserted rows')
  }

  const restated = await t.mutation(internal.ingestion.catalog.refreshListedEndpoints.restate, {
    restatements: [
      { _id: newer, row: staleRow('newer', { scan_at: hour(1) }) },
      { _id: unlisted, row: staleRow('unlisted', { scan_at: hour(1) }) },
    ],
  })

  expect(restated).toBe(0)
})
