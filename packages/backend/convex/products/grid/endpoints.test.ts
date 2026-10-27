import { expect, test } from 'vitest'

import { api } from '#generated/api'

import { CURRENT_ENDPOINTS_TABLE } from '../../catalog/tables/current'
import { setup } from '../../harness.testing'
import { endpointRow } from '../../ingestion/operators/currentEndpoints'
import { scan } from '../../ingestion/operators/testing'
import { INGESTION_RECORDS_TABLE } from '../../ingestion/tables'

const day = (index: number) => new Date(Date.UTC(2026, 0, 1 + index)).toISOString()

const CLOCK = day(30)

/** Endpoint creation and unlisting times; a missing creation reports no upstream creation. */
const ENDPOINTS = {
  // Listed for one day, unlisted nine days ago.
  brief: { created: day(20), unlisted: day(21) },
  // Unlisted exactly as long ago as it was listed.
  elapsed: { created: day(26), unlisted: day(28) },
  // Listed for 25 days, unlisted five days ago.
  established: { created: day(0), unlisted: day(25) },
  listed: { created: day(29), unlisted: undefined },
  unaged: { created: undefined, unlisted: day(21) },
}

test('grid hides unlistings that outlast the endpoint age', async () => {
  const t = setup()

  await t.run(async (ctx) => {
    await ctx.db.insert(INGESTION_RECORDS_TABLE, {
      alerts: true,
      from_scan_at: day(29),
      kind: 'pair',
      scan_at: CLOCK,
      state: 'complete',
    })

    for (const [id, { created, unlisted }] of Object.entries(ENDPOINTS)) {
      const spec = { created, model: 'm1', provider: 'p1' }
      const endpoint = scan(day(0), { endpoints: { [id]: spec } }).endpoints.get(id)

      if (endpoint === undefined) {
        throw new Error(`Missing endpoint ${id}`)
      }

      const version =
        unlisted === undefined ? { scan_at: CLOCK } : { scan_at: unlisted, unlisted_at: unlisted }

      await ctx.db.insert(CURRENT_ENDPOINTS_TABLE, endpointRow(endpoint, version))
    }
  })

  const rows = await t.query(api.products.grid.endpoints.grid, {})

  expect(rows.map(({ endpoint_id }) => endpoint_id).toSorted()).toEqual([
    'established',
    'listed',
    'unaged',
  ])
})
