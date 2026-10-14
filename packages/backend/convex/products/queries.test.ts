import { expect, test } from 'bun:test'
import path from 'node:path'

import { convexTest } from 'convex-test'

import { api } from '#generated/api'

import schema from '../schema'

const root = path.resolve(import.meta.dir, '..')
const modules = Object.fromEntries(
  [...new Bun.Glob('**/*.{ts,js}').scanSync({ absolute: true, cwd: root })]
    .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.d.ts'))
    .map((file) => [file, async (): Promise<unknown> => await import(file)]),
)

test('products expose live pricing histories with an independent completed-ingestion clock', async () => {
  const t = convexTest({ schema, modules })
  const a = '2026-10-10T10:00:00.000Z'
  const b = '2026-10-10T11:00:00.000Z'
  const paginationOpts = { numItems: 10, cursor: null }

  expect(await t.query(api.products.shared.clock.observe, {})).toBeNull()

  await t.run(async (ctx) => {
    await ctx.db.insert('scan_registrations', {
      from_scan_at: null,
      scan_at: a,
      progress: { kind: 'complete' },
    })
    await ctx.db.insert('scan_registrations', {
      from_scan_at: a,
      scan_at: b,
      progress: { kind: 'pending', completed: ['pricingHistory'] },
    })
    await ctx.db.insert('catalog_current_models', {
      model_id: 'model',
      display_name: 'Model',
      scan_at: a,
      first_scan_at: a,
      slug: 'model',
      permaslug: 'model',
      variant: 'standard',
      or_created_at: a,
      input_modalities: ['text'],
      output_modalities: ['text'],
      metadata_json: '{}',
    })
    await ctx.db.insert('catalog_current_providers', {
      provider_id: 'provider',
      display_name: 'Provider',
      scan_at: a,
      first_scan_at: a,
      metadata_json: '{}',
    })
    await ctx.db.insert('catalog_current_endpoints', {
      endpoint_id: 'endpoint',
      model_id: 'model',
      provider_id: 'provider',
      provider_tag: 'provider',
      provider_display_name: 'Provider',
      variant: 'standard',
      scan_at: a,
      first_scan_at: a,
      model_display_name: 'Model',
      model_permaslug: 'model',
      model_or_created_at: a,
      input_modalities: ['text'],
      output_modalities: ['text'],
      pricing: { discount: 0, meters: { prompt: '0' } },
      metadata_json: '{}',
    })
    await ctx.db.insert('catalog_current_stats', {
      scan_at: a,
      rows: [{ endpoint_id: 'endpoint', p50_latency: 1 }],
    })

    for (const scan_at of [a, b]) {
      await ctx.db.insert('catalog_pricing_history', {
        endpoint_id: 'endpoint',
        scan_at,
        discount: 0,
        meters: { prompt: '0' },
      })
      await ctx.db.insert('catalog_observations', {
        entity_id: 'endpoint',
        scan_at,
        model_id: 'model',
        provider_id: 'provider',
        provider_tag: 'provider',
        detected: true,
        entity_kind: 'endpoint',
      })
      await ctx.db.insert('catalog_stats_history', {
        endpoint_id: 'endpoint',
        scan_at,
        tier: 'default',
        sample: { p50_latency: 1 },
      })
    }
  })

  expect(await t.query(api.products.shared.clock.observe, {})).toBe(a)
  expect(await t.query(api.products.grid.stats.grid, {})).toEqual({
    as_of: a,
    rows: [{ endpoint_id: 'endpoint', p50_latency: 1 }],
  })
  const observations = await t.query(api.products.pricing_history.query.observations, {
    model_id: 'model',
  })
  expect(observations.map((endpoint) => endpoint.id)).toEqual(['endpoint'])
  expect(observations[0]?.observations.map((row) => row.scan_at)).toEqual([a, b])

  expect(
    await t.query(api.products.entity_overview.models.get, { model_id: 'model' }),
  ).toMatchObject({ display_name: 'Model', description: null })
  expect(
    await t.query(api.products.entity_overview.providers.get, { provider_id: 'provider' }),
  ).toMatchObject({ display_name: 'Provider', headquarters: null })
  const grid = await t.query(api.products.grid.endpoints.grid, {})
  expect(grid.map((row) => row.endpoint_id)).toEqual(['endpoint'])
  expect(grid[0]?.pricing.text_input).toBeUndefined()
  expect(
    await t.query(api.products.entity_overview.endpoints.get, { endpoint_id: 'endpoint' }),
  ).toEqual(grid[0])

  const args = { endpoint_id: 'endpoint', cutoff: b, paginationOpts }
  const stats = await t.query(api.products.stats_history.query.list, args)
  expect(stats.as_of).toBe(a)
  expect(stats.page.map((row) => row.scan_at)).toEqual([a])

  const live = await t.query(api.products.pricing_history.query.prices, {
    model_id: 'model',
  })
  expect(live[0]?.prices.map((row) => row.scan_at)).toEqual([a, b])
  expect(live[0]?.prices[0]?.meters.prompt).toBe('0')
})
