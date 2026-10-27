import { expect, test } from 'vitest'

import { internal } from '#generated/api'
import * as scans from '#scans'

import { CURRENT_ENDPOINTS_TABLE } from '../../catalog/tables/current'
import { setup } from '../../harness.testing'
import { endpointRow } from '../operators/currentEndpoints'
import { hour, rawScan, scan } from '../operators/testing'

const CREATED = '2025-12-01T00:00:00.000Z'

const SPECS = [
  { endpoints: { early: { model: 'm1', provider: 'p1' } } },
  { endpoints: { late: { created: CREATED, model: 'm1', provider: 'p2' } } },
  { endpoints: {} },
]

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

test('refresh restates unlisted metadata from the scan before each unlisting', async () => {
  const t = setup()

  await t.action(async (ctx) => {
    for (const [index, spec] of SPECS.entries()) {
      await scans.store(ctx, rawScan(hour(index), spec))
    }
  })

  await t.run(async (ctx) => {
    // `early` has no earlier scan to restate from.
    await ctx.db.insert(CURRENT_ENDPOINTS_TABLE, staleRow('early', hour(0)))
    await ctx.db.insert(CURRENT_ENDPOINTS_TABLE, staleRow('late', hour(2)))
  })

  const result = await t.action(internal.ingestion.catalog.refreshUnlistedEndpoints.run, {
    atOrAfter: hour(0),
  })

  expect(result).toEqual({ missing: ['early'], read: 2, restated: 1 })

  const rows = await t.run(async (ctx) => await ctx.db.query(CURRENT_ENDPOINTS_TABLE).collect())
  const metadata = new Map(rows.map((row) => [row.endpoint_id, JSON.parse(row.metadata_json)]))

  expect(metadata.get('late')).toMatchObject({ created_at: CREATED })
  expect(metadata.get('early')).not.toHaveProperty('created_at')
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
