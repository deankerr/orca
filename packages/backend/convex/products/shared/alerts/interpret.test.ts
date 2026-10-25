import { ok } from 'node:assert/strict'

import { expect, test } from 'vitest'

import { OBSERVATIONS_TABLE } from '../../../catalog/tables/observations'
import { setup } from '../../../harness.testing'
import { hour } from '../../../ingestion/operators/testing'
import { interpret } from './interpret'

test('a parent return completed before the pair that removed it is still announced', async () => {
  const t = setup()

  const alert = await t.run(async (ctx) => {
    // A baseline at hour 0 found the model; it departed at hour 1, but only the hour 2 pair has completed.
    await ctx.db.insert(OBSERVATIONS_TABLE, {
      endpoint_count: 1,
      entity_id: 'm1',
      entity_kind: 'model',
      previous_endpoint_count: null,
      scan_at: hour(0),
    })

    const id = await ctx.db.insert(OBSERVATIONS_TABLE, {
      endpoint_count: 1,
      entity_id: 'm1',
      entity_kind: 'model',
      previous_endpoint_count: 0,
      scan_at: hour(2),
    })

    const returned = await ctx.db.get(id)
    ok(returned !== null)

    return await interpret(ctx, returned)
  })

  expect(alert).toMatchObject({ entity_id: 'm1', previously_known: true, type: 'model_added' })
})

test('a baseline row has no comparison and announces nothing', async () => {
  const t = setup()

  const alert = await t.run(async (ctx) => {
    const id = await ctx.db.insert(OBSERVATIONS_TABLE, {
      endpoint_count: 1,
      entity_id: 'p1',
      entity_kind: 'provider',
      previous_endpoint_count: null,
      scan_at: hour(0),
    })

    const baseline = await ctx.db.get(id)
    ok(baseline !== null)

    return await interpret(ctx, baseline)
  })

  expect(alert).toBeNull()
})
