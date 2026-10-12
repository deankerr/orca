import { expect, spyOn, test } from 'bun:test'
import { ok, rejects } from 'node:assert/strict'
import path from 'node:path'

import { convexTest } from 'convex-test'

import { internal } from '#generated/api'
import type { RawScan } from '#scan/collection'
import * as scans from '#scanNew'

import { CURRENT_MODELS_TABLE } from '../catalog/tables/current'
import { ENDPOINT_LISTINGS_TABLE } from '../catalog/tables/listings'
import type { EndpointListingRow } from '../catalog/tables/listings'
import { fromCollected } from '../scanNew/extract'
import schema from '../schema'
import { INGESTIONS_TABLE } from './table'

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
              short_name: 'Refreshed name',
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

test('refresh restores a departed endpointless model from its final capture without producing history or Events', async () => {
  const t = setup()

  const id = await t.run(async (ctx) => {
    await ctx.db.insert(INGESTIONS_TABLE, {
      progress: { kind: 'complete' },
      from_scan_at: departure,
      scan_at: horizon,
    })

    await ctx.db.insert('catalog_observations', {
      entity_kind: 'model',
      entity_id: model.model_id,
      scan_at: first,
      detected: true,
      endpoint_count: 0,
    })

    await ctx.db.insert(INGESTIONS_TABLE, {
      progress: { kind: 'complete' },
      from_scan_at: lastSeen,
      scan_at: departure,
    })

    await ctx.db.insert('catalog_observations', {
      entity_kind: 'model',
      entity_id: model.model_id,
      scan_at: departure,
      detected: false,
      endpoint_count: 0,
    })
    return await ctx.db.insert(CURRENT_MODELS_TABLE, model)
  })

  const loaded: string[] = []

  const source = spyOn(scans, 'reader').mockImplementation((ctx) => ({
    ...originalReader(ctx),
    loadScan: async (at) => {
      loaded.push(at)
      return fromCollected(capture(at, at === lastSeen))
    },
  }))

  try {
    expect(
      await t.action(internal.ingestion.refresh.refreshCurrentEntity, {
        entity_kind: 'model',
        entity_id: model.model_id,
      }),
    ).toMatchObject({ changed: true, source_scan_at: lastSeen, source_basis: 'departure' })

    await t.run(async (ctx) => {
      const row = await ctx.db.get(id)

      expect(row).toMatchObject({
        ...model,
        scan_at: lastSeen,
        display_name: 'Refreshed name',
        metadata_json: '{"description":"Restored from capture"}',
      })

      expect(await ctx.db.query(ENDPOINT_LISTINGS_TABLE).collect()).toEqual([])
      expect(await ctx.db.query('catalog_events').collect()).toEqual([])
    })

    expect(
      await t.action(internal.ingestion.refresh.refreshCurrentEntity, {
        entity_kind: 'model',
        entity_id: model.model_id,
      }),
    ).toMatchObject({ changed: false })

    expect(loaded).toEqual([lastSeen, lastSeen])
  } finally {
    source.mockRestore()
  }
})

const originalReader = scans.reader

test('refresh prefers the latest capture for models still present after losing their endpoints', async () => {
  const t = setup()

  await t.run(async (ctx) => {
    await ctx.db.insert(CURRENT_MODELS_TABLE, model)

    await ctx.db.insert('catalog_observations', {
      entity_kind: 'model',
      entity_id: model.model_id,
      scan_at: first,
      detected: true,
      endpoint_count: 0,
    })

    await ctx.db.insert(INGESTIONS_TABLE, {
      progress: { kind: 'complete' },
      from_scan_at: departure,
      scan_at: horizon,
    })
  })

  await t.run(async (ctx) => {
    const future = '2026-10-04T00:00:00.000Z'

    await ctx.db.insert(INGESTIONS_TABLE, {
      from_scan_at: horizon,
      scan_at: future,
      progress: { kind: 'pending', completed: ['observations'] },
    })

    await ctx.db.insert('catalog_observations', {
      entity_kind: 'model',
      entity_id: model.model_id,
      scan_at: future,
      detected: false,
      endpoint_count: 0,
    })
  })

  const source = spyOn(scans, 'reader').mockImplementation((ctx) => ({
    ...originalReader(ctx),
    loadScan: async (at) => fromCollected(capture(at, true)),
  }))

  try {
    expect(
      await t.action(internal.ingestion.refresh.refreshCurrentEntity, {
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
    await ctx.db.insert(INGESTIONS_TABLE, {
      progress: { kind: 'complete' },
      from_scan_at: departure,
      scan_at: horizon,
    })

    await ctx.db.insert('catalog_observations', {
      entity_kind: 'model',
      entity_id: model.model_id,
      scan_at: first,
      detected: true,
      endpoint_count: 0,
    })
    return await ctx.db.insert(CURRENT_MODELS_TABLE, model)
  })

  const source = spyOn(scans, 'reader').mockImplementation((ctx) => ({
    ...originalReader(ctx),
    loadScan: async (at) => {
      await t.run(async (ctx) => {
        await ctx.db.patch(id, { display_name: 'Concurrent ingestion' })
      })
      return fromCollected(capture(at, true))
    },
  }))

  try {
    await rejects(
      t.action(internal.ingestion.refresh.refreshCurrentEntity, {
        entity_kind: 'model',
        entity_id: model.model_id,
      }),
      /Entity changed during current view refresh/,
    )

    expect(await t.run(async (ctx) => await ctx.db.get(id))).toMatchObject({
      display_name: 'Concurrent ingestion',
    })
  } finally {
    source.mockRestore()
  }
})

test('refresh rebuilds provider and endpoint fields while preserving first observation and unlisting', async () => {
  const t = setup()
  const raw = capture(lastSeen, true)
  const [entry] = raw.entries
  ok(entry?.endpoints)

  entry.endpoints.push({
    id: 'endpoint',
    model_variant_slug: model.slug,
    variant: 'standard',
    provider_slug: 'provider',
    provider_display_name: 'New endpoint label',
    provider_info: { slug: 'provider', displayName: 'New provider', description: 'New details' },
    pricing: { discount: 0, prompt: '2' },
    context_length: 32_000,
  })

  const observed = fromCollected(raw)

  const endpointId = await t.run(async (ctx) => {
    await ctx.db.insert(INGESTIONS_TABLE, {
      from_scan_at: lastSeen,
      scan_at: departure,
      progress: { kind: 'complete' },
    })

    await ctx.db.insert(ENDPOINT_LISTINGS_TABLE, listed)

    await ctx.db.insert(ENDPOINT_LISTINGS_TABLE, {
      ...listed,
      scan_at: departure,
      state: 'unlisted',
    })

    await ctx.db.insert('catalog_observations', {
      entity_kind: 'provider',
      entity_id: 'provider',
      scan_at: departure,
      endpoint_count: 0,
    })

    await ctx.db.insert('catalog_observations', {
      entity_kind: 'endpoint',
      entity_id: 'endpoint',
      scan_at: departure,
      detected: false,
      model_id: model.model_id,
      provider_id: 'provider',
      provider_tag: 'provider',
    })

    await ctx.db.insert('catalog_current_providers', {
      provider_id: 'provider',
      display_name: 'Old provider',
      first_scan_at: first,
      scan_at: first,
      metadata_json: '{"obsolete":true}',
    })
    return await ctx.db.insert('catalog_current_endpoints', {
      endpoint_id: 'endpoint',
      provider_id: 'provider',
      model_id: model.model_id,
      provider_tag: 'provider',
      provider_display_name: 'Old label',
      variant: 'standard',
      scan_at: lastSeen,
      first_scan_at: first,
      unlisted_at: departure,
      model_display_name: 'Old model',
      model_permaslug: model.permaslug,
      model_or_created_at: first,
      input_modalities: ['text'],
      output_modalities: ['text'],
      pricing: { discount: 0, meters: { prompt: '1' } },
      metadata_json: '{"obsolete":true}',
    })
  })

  const source = spyOn(scans, 'reader').mockImplementation((ctx) => ({
    ...originalReader(ctx),
    loadScan: async (at) => ({ ...observed, scan_at: at }),
  }))

  try {
    for (const [entity_kind, entity_id] of [
      ['provider', 'provider'],
      ['endpoint', 'endpoint'],
    ] as const) {
      expect(
        await t.action(internal.ingestion.refresh.refreshCurrentEntity, {
          entity_kind,
          entity_id,
        }),
      ).toMatchObject({ changed: true, source_basis: 'departure', source_scan_at: lastSeen })
    }

    await t.run(async (ctx) => {
      expect(await ctx.db.get(endpointId)).toMatchObject({
        first_scan_at: first,
        scan_at: lastSeen,
        unlisted_at: departure,
        model_display_name: 'Refreshed name',
        provider_display_name: 'New endpoint label',
        pricing: { discount: 0, meters: { prompt: '2' } },
      })

      const provider = await ctx.db.query('catalog_current_providers').unique()

      expect(provider).toMatchObject({
        first_scan_at: first,
        scan_at: lastSeen,
        display_name: 'New provider',
      })

      ok(provider)
      expect(JSON.parse(provider.metadata_json)).toEqual({ description: 'New details' })
      expect(await ctx.db.query('catalog_events').collect()).toEqual([])
      expect(await ctx.db.query('catalog_pricing_history').collect()).toEqual([])
      expect(await ctx.db.query('catalog_stats_history').collect()).toEqual([])
      expect(await ctx.db.query('catalog_current_stats').collect()).toEqual([])
      expect(await ctx.db.query(ENDPOINT_LISTINGS_TABLE).collect()).toHaveLength(2)
      expect(await ctx.db.query(INGESTIONS_TABLE).collect()).toHaveLength(1)
    })
    // Reappearance and reassignment retain endpoint identity, but refresh its new relationships.
    const endpoint = observed.endpoints.get('endpoint')
    ok(endpoint)
    endpoint.endpoint.model_id = 'author/renamed'
    endpoint.endpoint.provider_id = 'other'
    endpoint.endpoint.provider_tag = 'other/new'

    await t.run(async (ctx) => {
      await ctx.db.insert(INGESTIONS_TABLE, {
        from_scan_at: departure,
        scan_at: horizon,
        progress: { kind: 'complete' },
      })

      await ctx.db.patch(endpointId, { unlisted_at: undefined })

      await ctx.db.insert('catalog_observations', {
        entity_kind: 'endpoint',
        entity_id: 'endpoint',
        scan_at: horizon,
        detected: true,
        model_id: 'author/renamed',
        provider_id: 'other',
        provider_tag: 'other/new',
      })
    })

    expect(
      await t.action(internal.ingestion.refresh.refreshCurrentEntity, {
        entity_kind: 'endpoint',
        entity_id: 'endpoint',
      }),
    ).toMatchObject({ changed: true, source_basis: 'latest', source_scan_at: horizon })

    const refreshed = await t.run(async (ctx) => await ctx.db.get(endpointId))

    expect(refreshed).toMatchObject({
      endpoint_id: 'endpoint',
      model_id: 'author/renamed',
      provider_id: 'other',
      first_scan_at: first,
    })

    expect(refreshed?.unlisted_at).toBeUndefined()
  } finally {
    source.mockRestore()
  }
})

test('refresh waits when current facts or endpoint availability are ahead of the completion clock', async () => {
  const t = setup()

  const id = await t.run(async (ctx) => {
    await ctx.db.insert(INGESTIONS_TABLE, {
      from_scan_at: null,
      scan_at: first,
      progress: { kind: 'complete' },
    })

    await ctx.db.insert(INGESTIONS_TABLE, {
      from_scan_at: first,
      scan_at: lastSeen,
      progress: { kind: 'pending', completed: ['currentModels'] },
    })

    await ctx.db.insert('catalog_observations', {
      entity_kind: 'model',
      entity_id: model.model_id,
      scan_at: first,
      detected: true,
      endpoint_count: 0,
    })
    return await ctx.db.insert(CURRENT_MODELS_TABLE, { ...model, scan_at: lastSeen })
  })

  await rejects(
    t.query(internal.ingestion.refresh.models.read, { model_id: model.model_id }),
    /pending ingestion changes/,
  )

  await t.run(async (ctx) => {
    await ctx.db.patch(id, { scan_at: first })
  })

  expect(
    await t.query(internal.ingestion.refresh.models.read, { model_id: model.model_id }),
  ).toMatchObject({ as_of: first })

  await t.run(async (ctx) => {
    await ctx.db.insert('catalog_current_endpoints', {
      endpoint_id: 'endpoint',
      model_id: model.model_id,
      provider_id: 'provider',
      provider_tag: 'provider',
      provider_display_name: 'Provider',
      variant: 'standard',
      first_scan_at: first,
      scan_at: first,
      unlisted_at: lastSeen,
      model_display_name: model.display_name,
      model_permaslug: model.permaslug,
      model_or_created_at: first,
      input_modalities: ['text'],
      output_modalities: ['text'],
      pricing: { discount: 0, meters: {} },
      metadata_json: '{}',
    })
  })

  await rejects(
    t.query(internal.ingestion.refresh.endpoints.read, {
      endpoint_id: 'endpoint',
    }),
    /pending ingestion changes/,
  )
})

test('missing source entities fail without clearing retained facts', async () => {
  const t = setup()

  const id = await t.run(async (ctx) => {
    await ctx.db.insert(INGESTIONS_TABLE, {
      from_scan_at: first,
      scan_at: horizon,
      progress: { kind: 'complete' },
    })

    await ctx.db.insert('catalog_observations', {
      entity_kind: 'model',
      entity_id: model.model_id,
      scan_at: first,
      detected: true,
      endpoint_count: 0,
    })
    return await ctx.db.insert(CURRENT_MODELS_TABLE, model)
  })

  const source = spyOn(scans, 'reader').mockImplementation((ctx) => ({
    ...originalReader(ctx),
    loadScan: async (at) => fromCollected(capture(at, false)),
  }))

  try {
    await rejects(
      t.action(internal.ingestion.refresh.refreshCurrentEntity, {
        entity_kind: 'model',
        entity_id: model.model_id,
      }),
      /Entity is absent/,
    )

    expect(await t.run(async (ctx) => await ctx.db.get(id))).toMatchObject(model)
  } finally {
    source.mockRestore()
  }
})

test('refresh targets paginate retained entities, including departed identities', async () => {
  const t = setup()

  await t.run(async (ctx) => {
    await ctx.db.insert(CURRENT_MODELS_TABLE, model)
    await ctx.db.insert(CURRENT_MODELS_TABLE, { ...model, model_id: 'second' })
  })

  const firstPage = await t.query(internal.ingestion.refresh.targets, {
    entity_kind: 'model',
    paginationOpts: { numItems: 1, cursor: null },
  })

  expect(firstPage.page).toEqual([{ entity_kind: 'model', entity_id: model.model_id }])

  const nextPage = await t.query(internal.ingestion.refresh.targets, {
    entity_kind: 'model',
    paginationOpts: { numItems: 1, cursor: firstPage.continueCursor },
  })

  expect(nextPage.page).toEqual([{ entity_kind: 'model', entity_id: 'second' }])
})

test('an unchanged projection keeps its source date even when refreshed from a newer capture', async () => {
  const t = setup()

  const id = await t.run(async (ctx) => {
    await ctx.db.insert(INGESTIONS_TABLE, {
      from_scan_at: first,
      scan_at: horizon,
      progress: { kind: 'complete' },
    })

    await ctx.db.insert('catalog_observations', {
      entity_kind: 'model',
      entity_id: model.model_id,
      scan_at: first,
      detected: true,
      endpoint_count: 0,
    })
    return await ctx.db.insert(CURRENT_MODELS_TABLE, {
      ...model,
      display_name: 'Refreshed name',
      metadata_json: '{"license":"mit","description":"Restored from capture"}',
    })
  })

  const source = spyOn(scans, 'reader').mockImplementation((ctx) => ({
    ...originalReader(ctx),
    loadScan: async (at) => {
      const scan = fromCollected(capture(at, true))
      const observed = scan.models.get(model.model_id)
      ok(observed)
      observed.license = 'mit'
      return scan
    },
  }))

  try {
    expect(
      await t.action(internal.ingestion.refresh.refreshCurrentEntity, {
        entity_kind: 'model',
        entity_id: model.model_id,
      }),
    ).toMatchObject({ changed: false, source_scan_at: horizon })

    expect(await t.run(async (ctx) => await ctx.db.get(id))).toMatchObject({ scan_at: first })
  } finally {
    source.mockRestore()
  }
})

test('missing presence history fails before loading a capture', async () => {
  const t = setup()

  await t.run(async (ctx) => {
    await ctx.db.insert(CURRENT_MODELS_TABLE, model)

    await ctx.db.insert(INGESTIONS_TABLE, {
      from_scan_at: null,
      scan_at: first,
      progress: { kind: 'complete' },
    })
  })

  await rejects(
    t.action(internal.ingestion.refresh.refreshCurrentEntity, {
      entity_kind: 'model',
      entity_id: model.model_id,
    }),
    (error: unknown) => {
      expect(error).toMatchObject({
        data: {
          message: 'Catalog model has no observation at the completed cutoff',
          entity_kind: 'model',
          entity_id: model.model_id,
        },
      })
      return true
    },
  )
})

test('invalid departure inputs fail without loading or replacing current facts', async () => {
  for (const input of ['missing', 'baseline', 'pending'] as const) {
    const t = setup()

    await t.run(async (ctx) => {
      await ctx.db.insert(CURRENT_MODELS_TABLE, model)

      await ctx.db.insert(INGESTIONS_TABLE, {
        from_scan_at: departure,
        scan_at: horizon,
        progress: { kind: 'complete' },
      })

      await ctx.db.insert('catalog_observations', {
        entity_kind: 'model',
        entity_id: model.model_id,
        scan_at: departure,
        detected: false,
        endpoint_count: 0,
      })

      if (input !== 'missing') {
        await ctx.db.insert(INGESTIONS_TABLE, {
          from_scan_at: input === 'baseline' ? null : lastSeen,
          scan_at: departure,
          progress: input === 'pending' ? { kind: 'pending', completed: [] } : { kind: 'complete' },
        })
      }
    })

    await rejects(
      t.action(internal.ingestion.refresh.refreshCurrentEntity, {
        entity_kind: 'model',
        entity_id: model.model_id,
      }),
      /Departure observation requires a completed input/,
    )
  }
})
