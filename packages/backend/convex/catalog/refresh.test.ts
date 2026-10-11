import { expect, spyOn, test } from 'bun:test'
import { rejects } from 'node:assert/strict'
import path from 'node:path'

import { convexTest } from 'convex-test'

import { internal } from '#generated/api'
import * as scans from '#scan'
import type { RawScan } from '#scan/collection'

import { ENDPOINT_LISTINGS_TABLE } from '../history/listings/table'
import type { EndpointListingRow } from '../history/listings/table'
import { INGESTIONS_TABLE } from '../ingestion/table'
import schema from '../schema'
import { CURRENT_MODELS_TABLE } from './models/table'
import { lastEndpointScan } from './source'

function setup() {
  const root = path.resolve(import.meta.dir, '..')
  const modules = Object.fromEntries(
    [...new Bun.Glob('**/*.{ts,js}').scanSync({ absolute: true, cwd: root })]
      .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.d.ts'))
      .map((file) => [file, async (): Promise<unknown> => await import(file)]),
  )
  return convexTest({ schema, modules, transactionLimits: true })
}

const first = '2026-10-01T10:00:00.000Z'
const lastSeen = '2026-10-02T14:07:00.000Z'
const departure = '2026-10-02T16:13:00.000Z'
const horizon = '2026-10-03T10:00:00.000Z'
const listed: EndpointListingRow = {
  scan_at: first,
  endpoint_id: 'endpoint',
  model_id: 'author/model',
  provider_id: 'provider',
  provider_tag: 'provider/tag',
  state: 'listed',
}

test('source follows identity transitions outside the model/provider index and uses the actual previous scan', async () => {
  const t = setup()
  await t.run(async (ctx) => {
    await ctx.db.insert(ENDPOINT_LISTINGS_TABLE, listed)
    await ctx.db.insert(ENDPOINT_LISTINGS_TABLE, {
      ...listed,
      scan_at: departure,
      model_id: 'author/renamed',
      provider_id: 'other',
    })
    await ctx.db.insert(INGESTIONS_TABLE, { from_scan_at: lastSeen, scan_at: departure })
    expect(await lastEndpointScan(ctx, 'model', listed.model_id, horizon)).toBe(lastSeen)
    expect(await lastEndpointScan(ctx, 'provider', listed.provider_id, horizon)).toBe(lastSeen)
    expect(await lastEndpointScan(ctx, 'endpoint', listed.endpoint_id, horizon)).toBe(horizon)
    expect(await lastEndpointScan(ctx, 'model', listed.model_id, lastSeen)).toBe(lastSeen)
    expect(await lastEndpointScan(ctx, 'model', 'never-listed', horizon)).toBeNull()
  })
})

test('source selects the last membership across endpoints, including unlisting and reappearance', async () => {
  const t = setup()
  await t.run(async (ctx) => {
    await ctx.db.insert(ENDPOINT_LISTINGS_TABLE, listed)
    await ctx.db.insert(ENDPOINT_LISTINGS_TABLE, {
      ...listed,
      scan_at: lastSeen,
      state: 'unlisted',
    })
    await ctx.db.insert(INGESTIONS_TABLE, { from_scan_at: first, scan_at: lastSeen })
    await ctx.db.insert(ENDPOINT_LISTINGS_TABLE, { ...listed, endpoint_id: 'second' })
    await ctx.db.insert(ENDPOINT_LISTINGS_TABLE, {
      ...listed,
      endpoint_id: 'second',
      scan_at: departure,
      state: 'unlisted',
    })
    await ctx.db.insert(INGESTIONS_TABLE, { from_scan_at: lastSeen, scan_at: departure })
    expect(await lastEndpointScan(ctx, 'model', listed.model_id, horizon)).toBe(lastSeen)
    await ctx.db.insert(ENDPOINT_LISTINGS_TABLE, { ...listed, scan_at: horizon })
    expect(await lastEndpointScan(ctx, 'model', listed.model_id, horizon)).toBe(horizon)
  })
})

const model = {
  model_id: listed.model_id,
  scan_at: first,
  first_scan_at: first,
  slug: listed.model_id,
  permaslug: 'author/model-permanent',
  variant: 'standard',
  display_name: 'Example',
  or_created_at: first,
  input_modalities: ['text'],
  output_modalities: ['text'],
  metadata_json: '{}',
}

function capture(scan_at: string, present: boolean): RawScan {
  return {
    scan_at,
    entries: present
      ? [
          {
            model_id: model.model_id,
            variant: model.variant,
            model: {
              slug: model.slug,
              permaslug: model.permaslug,
              short_name: model.display_name,
              created_at: first,
              input_modalities: ['text'],
              output_modalities: ['text'],
              description: 'Restored from capture',
            },
            endpoints: [],
          },
        ]
      : [],
  }
}

test('refresh restores a never-listed model from its stored source without producing history or Events', async () => {
  const t = setup()
  const id = await t.run(async (ctx) => {
    await ctx.db.insert(INGESTIONS_TABLE, { from_scan_at: departure, scan_at: horizon })
    return await ctx.db.insert(CURRENT_MODELS_TABLE, model)
  })
  const source = spyOn(scans, 'reader').mockImplementation((ctx) => ({
    ...originalReader(ctx),
    loadCollected: async (at = horizon) => await Promise.resolve(capture(at, at === first)),
  }))

  try {
    expect(
      await t.action(internal.catalog.refresh.run, {
        entity_kind: 'model',
        entity_id: model.model_id,
      }),
    ).toMatchObject({ changed: true, source_scan_at: first, source_basis: 'catalog' })
    await t.run(async (ctx) => {
      const row = await ctx.db.get(id)
      expect(row).toMatchObject({
        ...model,
        metadata_json: '{"description":"Restored from capture"}',
      })
      expect(await ctx.db.query(ENDPOINT_LISTINGS_TABLE).collect()).toEqual([])
      expect(await ctx.db.query('v4_events').collect()).toEqual([])
    })
    expect(
      await t.action(internal.catalog.refresh.run, {
        entity_kind: 'model',
        entity_id: model.model_id,
      }),
    ).toMatchObject({ changed: false })
  } finally {
    source.mockRestore()
  }
})

const originalReader = scans.reader

test('refresh prefers the latest capture for models still present after losing their endpoints', async () => {
  const t = setup()
  await t.run(async (ctx) => {
    await ctx.db.insert(CURRENT_MODELS_TABLE, model)
    await ctx.db.insert(INGESTIONS_TABLE, { from_scan_at: departure, scan_at: horizon })
  })
  const source = spyOn(scans, 'reader').mockImplementation((ctx) => ({
    ...originalReader(ctx),
    loadCollected: async (at = horizon) => await Promise.resolve(capture(at, true)),
  }))

  try {
    expect(
      await t.action(internal.catalog.refresh.run, {
        entity_kind: 'model',
        entity_id: model.model_id,
      }),
    ).toMatchObject({ changed: true, source_scan_at: horizon, source_basis: 'latest' })
  } finally {
    source.mockRestore()
  }
})

test('refresh refuses to overwrite a Catalog update that arrived during source loading', async () => {
  const t = setup()
  const id = await t.run(async (ctx) => {
    await ctx.db.insert(INGESTIONS_TABLE, { from_scan_at: departure, scan_at: horizon })
    return await ctx.db.insert(CURRENT_MODELS_TABLE, model)
  })
  const before = await t.query(internal.catalog.refresh.read, {
    entity_kind: 'model',
    entity_id: model.model_id,
  })
  await t.run(async (ctx) => {
    await ctx.db.patch(id, { metadata_json: '{"description":"New ingestion"}' })
  })
  await rejects(
    t.mutation(internal.catalog.refresh.apply, {
      before,
      metadata_json: '{}',
      source_scan_at: horizon,
    }),
    /Entity changed during metadata refresh/,
  )
})
