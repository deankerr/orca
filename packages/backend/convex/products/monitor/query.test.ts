import { expect, test } from 'bun:test'
import { rejects } from 'node:assert/strict'
import path from 'node:path'

import { convexTest } from 'convex-test'

import { api } from '#generated/api'

import schema from '../../schema'

const root = path.resolve(import.meta.dir, '../..')
const modules = Object.fromEntries(
  [...new Bun.Glob('**/*.{ts,js}').scanSync({ absolute: true, cwd: root })]
    .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.d.ts'))
    .map((file) => [file, async (): Promise<unknown> => await import(file)]),
)
const scan_at = '2026-10-10T00:00:00.000Z'
const paginationOpts = { numItems: 100, cursor: null }

test('Monitor and Feed return empty pages before the first completed ingestion', async () => {
  const t = convexTest({ schema, modules })
  const empty = { page: [], isDone: true, continueCursor: '' }

  for (const pending of [false, true]) {
    if (pending) {
      await t.run(async (ctx) => {
        await ctx.db.insert('scan_ingestions', {
          from_scan_at: null,
          scan_at,
          progress: { kind: 'pending', completed: [] },
        })
      })
    }

    expect(
      await t.query(api.products.monitor.query.feed, { scope: { kind: 'all' }, paginationOpts }),
    ).toEqual(empty)
    expect(await t.query(api.products.feed.query.list, { paginationOpts })).toEqual(empty)
  }
})

test('Monitor scopes use captured relationships and exclude incomplete scans', async () => {
  const t = convexTest({ schema, modules })
  await t.run(async (ctx) => {
    await ctx.db.insert('scan_ingestions', {
      from_scan_at: null,
      scan_at,
      progress: { kind: 'complete' },
    })
    for (const [endpoint, provider] of [
      ['one', 'first'],
      ['two', 'second'],
    ] as const) {
      await ctx.db.insert('catalog_events', {
        entity_kind: 'endpoint',
        entity_id: endpoint,
        scan_at,
        type: 'UPDATE',
        context: {
          model: { model_id: 'model', display_name: 'Model' },
          provider: { provider_id: provider, display_name: provider },
          endpoint: {
            endpoint_id: endpoint,
            provider_tag: provider,
            provider_display_name: provider,
          },
        },
        change_json: JSON.stringify({
          changes: [
            {
              key: 'metadata',
              type: 'UPDATE',
              changes: [{ key: 'context_length', type: 'UPDATE', oldValue: 100, value: 200 }],
            },
          ],
        }),
      })
    }
  })
  for (const [scope, expected] of [
    [{ kind: 'all' }, ['two', 'one']],
    [{ kind: 'model', model_id: 'model' }, ['two', 'one']],
    [{ kind: 'provider', provider_id: 'first' }, ['one']],
    [{ kind: 'pair', model_id: 'model', provider_id: 'second' }, ['two']],
    [{ kind: 'endpoint', endpoint_id: 'one' }, ['one']],
  ] as const) {
    const page = await t.query(api.products.monitor.query.feed, { scope, paginationOpts })
    expect(page.page.map((row) => row.entity_id)).toEqual([...expected])
  }
})

test('Monitor choices retain departed models with endpoint history and omit virtual or endpointless models', async () => {
  const t = convexTest({ schema, modules })
  await t.run(async (ctx) => {
    for (const model_id of ['departed', 'endpointless', 'openrouter/auto']) {
      await ctx.db.insert('catalog_current_models', {
        model_id,
        display_name: model_id,
        scan_at,
        first_scan_at: scan_at,
        slug: model_id,
        permaslug: model_id,
        variant: 'standard',
        or_created_at: scan_at,
        input_modalities: ['text'],
        output_modalities: ['text'],
        metadata_json: '{}',
      })
    }
    await ctx.db.insert('catalog_observations', {
      entity_kind: 'endpoint',
      entity_id: 'endpoint',
      scan_at,
      detected: false,
      model_id: 'departed',
      provider_id: 'provider',
      provider_tag: 'provider',
    })
  })
  expect(await t.query(api.products.monitor.query.models, { paginationOpts })).toMatchObject({
    page: [{ id: 'departed', name: 'departed', permaslug: 'departed', variant: 'standard' }],
    isDone: true,
  })
})

test('malformed and legacy cursors fail with the Feed client-error classification', async () => {
  const t = convexTest({ schema, modules })
  for (const cursor of ['invalid', '{}', '[1]', '["scan",{},"id"]']) {
    await rejects(
      t.query(api.products.feed.query.list, { paginationOpts: { numItems: 1, cursor } }),
      /InvalidCursor/,
    )
  }
})
