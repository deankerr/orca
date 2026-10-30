import { drainScheduledFunctions } from '@orca/config/testing'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { internal } from '#generated/api'
import * as scans from '#scans'

import { CURRENT_MODELS_TABLE } from '../../catalog/tables/current'
import { setup } from '../../harness.testing'
import { modelRow } from '../operators/currentModels'
import { hour, rawScan, scan } from '../operators/testing'
import { INGESTION_RECORDS_TABLE } from '../tables'

const STALE = '{"retired":true}'

const SPEC = { endpoints: { e1: { model: 'm1', provider: 'p1' } } }

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/** A row for `model_id` written at `scan_at`, with stale metadata. */
function staleRow(model_id: string, scan_at: string) {
  const model = scan(hour(0), SPEC).models.get('m1')

  if (model === undefined) {
    throw new Error('Missing model m1')
  }

  return { ...modelRow(model, { scan_at }), metadata_json: STALE, model_id }
}

test('refresh restates served models from the latest committed scan', async () => {
  const t = setup()
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

  await t.action(async (ctx) => {
    await scans.store(ctx, rawScan(hour(1), SPEC))
  })

  await t.run(async (ctx) => {
    await ctx.db.insert(INGESTION_RECORDS_TABLE, {
      alerts: false,
      from_scan_at: null,
      kind: 'baseline',
      scan_at: hour(1),
      state: 'complete',
    })

    await ctx.db.insert(CURRENT_MODELS_TABLE, staleRow('m1', hour(0)))
    await ctx.db.insert(CURRENT_MODELS_TABLE, staleRow('gone', hour(0)))
  })

  await t.mutation(internal.ingestion.catalog.refreshModels.run, {})
  await drainScheduledFunctions(t)

  const stored = await t.run(async (ctx) => await ctx.db.query(CURRENT_MODELS_TABLE).collect())
  const rows = new Map(stored.map((row) => [row.model_id, row]))

  expect(rows.get('m1')?.scan_at).toBe(hour(1))
  expect(rows.get('m1')?.metadata_json).not.toBe(STALE)
  expect(rows.get('gone')?.scan_at).toBe(hour(0))
  expect(log).toHaveBeenCalledWith('Refreshed models', { absent: 1, read: 2, restated: 1 })
})

test('restating skips rows ingested past the refresh scan', async () => {
  const t = setup()

  const id = await t.run(
    async (ctx) => await ctx.db.insert(CURRENT_MODELS_TABLE, staleRow('m1', hour(2))),
  )

  const restated = await t.mutation(internal.ingestion.catalog.refreshModels.restate, {
    restatements: [{ _id: id, row: staleRow('m1', hour(1)) }],
  })

  expect(restated).toBe(0)
})
