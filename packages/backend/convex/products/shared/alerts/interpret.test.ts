import { expect, test } from 'bun:test'
import { ok } from 'node:assert/strict'

import { OBSERVATIONS_TABLE } from '../../../catalog/tables/observations'
import { setup } from '../../../harness.testing'
import { hour } from '../../../ingestion/operators/testing'
import { interpret } from './interpret'

test('a parent return completed before the pair that removed it is still announced', async () => {
  const t = setup()

  const alert = await t.run(async (ctx) => {
    // A baseline at hour 0 found the model; it departed at hour 1, but only the hour 2 pair has completed.
    await ctx.db.insert(OBSERVATIONS_TABLE, {
      entity_kind: 'model',
      entity_id: 'm1',
      scan_at: hour(0),
      endpoint_count: 1,
      previous_endpoint_count: null,
    })
    const id = await ctx.db.insert(OBSERVATIONS_TABLE, {
      entity_kind: 'model',
      entity_id: 'm1',
      scan_at: hour(2),
      endpoint_count: 1,
      previous_endpoint_count: 0,
    })
    const returned = await ctx.db.get(id)
    ok(returned !== null)
    return await interpret(ctx, returned)
  })

  expect(alert).toMatchObject({ type: 'model_added', entity_id: 'm1', previously_known: true })
})

test('a baseline row has no comparison and announces nothing', async () => {
  const t = setup()

  const alert = await t.run(async (ctx) => {
    const id = await ctx.db.insert(OBSERVATIONS_TABLE, {
      entity_kind: 'provider',
      entity_id: 'p1',
      scan_at: hour(0),
      endpoint_count: 1,
      previous_endpoint_count: null,
    })
    const baseline = await ctx.db.get(id)
    ok(baseline !== null)
    return await interpret(ctx, baseline)
  })

  expect(alert).toBeNull()
})
