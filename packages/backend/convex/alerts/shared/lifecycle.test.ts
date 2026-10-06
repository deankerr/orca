/* oxlint-disable typescript/no-unsafe-type-assertion -- A small database double exercises acceptance and delayed event commits without deploying test functions. */
import { expect, test } from 'bun:test'
import { rejects } from 'node:assert/strict'

import type { RegisteredMutation } from 'convex/server'

import type { MutationCtx } from '#generated/server'

import * as endpoints from '../../catalog/endpoints/ingest'
import * as models from '../../catalog/models/ingest'
import * as providers from '../../catalog/providers/ingest'
import * as stats from '../../catalog/stats/ingest'
import { commit } from '../../events/ingest'
import { prepare } from '../../events/prepare'
import type { EventRow } from '../../events/table'
import * as listings from '../../history/listings/ingest'
import { commitIngestion } from '../../ingest'
import type { ScannedEndpoint, ScannedModel, ScannedProvider, Scan } from '../../scan'
import { prepareBatch as prepareDiscordBatch } from '../discord/prepare'
import type { DiscordUrls } from '../discord/renderers/card'
import { renderDiscordBatch } from '../discord/renderers/index'
import { render as renderPrepared } from '../feed/render'
import { prepare as prepareAlert } from './prepare'

function handler<Args extends Record<string, unknown>, Result>(
  mutation: RegisteredMutation<'internal', Args, Result>,
) {
  return (mutation as unknown as { _handler: (ctx: MutationCtx, args: Args) => Promise<Result> })
    ._handler
}

test('baseline, historical models, discoveries and repeated returns survive delayed event processing', async () => {
  const tables = new Map<string, Record<string, unknown>[]>()
  const rows = (table: string) => tables.get(table) ?? []

  const db = {
    query: (table: string) => {
      let indexFields: string[] = []

      let selected = rows(table).toSorted((a, b) =>
        String(a.scan_at).localeCompare(String(b.scan_at)),
      )

      const range = {
        eq: (key: string, value: unknown) => {
          expect(indexFields.shift()).toBe(key)
          selected = selected.filter((row) => row[key] === value)
          return range
        },
        lt: (key: string, value: string) => {
          expect(indexFields.shift()).toBe(key)
          selected = selected.filter((row) => String(row[key]) < value)
          return range
        },
      }

      const query = {
        withIndex: (name: string, select?: (q: typeof range) => unknown) => {
          indexFields = name.slice(3).split('_and_')
          select?.(range)
          return query
        },
        order: (direction: string) => {
          if (direction === 'desc') {
            selected.reverse()
          }

          return query
        },
        first: async () => selected[0] ?? null,
        unique: async () => {
          expect(selected.length).toBeLessThanOrEqual(1)
          return selected[0] ?? null
        },
      }
      return query
    },
    insert: async (table: string, row: Record<string, unknown>) => {
      const id = `${table}/${rows(table).length}`
      tables.set(table, [...rows(table), { ...row, _id: id }])
      return id
    },
    get: async (table: string, id: string) => rows(table).find((row) => row._id === id) ?? null,
    replace: async (table: string, id: string, row: Record<string, unknown>) => {
      tables.set(
        table,
        rows(table).map((before) => (before._id === id ? { ...row, _id: id } : before)),
      )
    },
    patch: async (table: string, id: string, patch: Record<string, unknown>) => {
      const row = rows(table).find((item) => item._id === id)

      if (row === undefined) {
        throw new Error('Missing test row')
      }

      Object.assign(row, patch)
    },
  }

  const ctx = { db } as unknown as MutationCtx

  const model = (id: string): ScannedModel => ({
    id,
    slug: id.split(':')[0] ?? id,
    permaslug: id,
    variant: id.endsWith(':free') ? 'free' : 'standard',
    short_name: id,
    created_at: '2023-01-01T00:00:00Z',
    input_modalities: ['text'],
    output_modalities: ['text'],
  })

  const endpoint = (id: string, model_id: string, provider_id: string): ScannedEndpoint => ({
    id,
    model_id,
    provider_id,
    model_variant_slug: model_id,
    variant: model(model_id).variant,
    provider_tag: `${provider_id}/fp8`,
    provider_display_name: provider_id,
    pricing: { discount: 0, prompt: '0.000001' },
  })

  const baselineEndpoint = endpoint('baseline', 'author/baseline', 'baseline-provider')
  const vintageEndpoint = endpoint('vintage', 'author/vintage', 'baseline-provider')
  const newEndpoint = endpoint('new', 'author/new', 'new-provider')

  const makeScan = (hour: number, active: ScannedEndpoint[], modelIds: string[]): Scan => ({
    scan_at: `2026-09-30T0${hour}:00:00.000Z`,
    models: new Map(modelIds.map((id) => [id, model(id)])),
    providers: new Map(
      active.map(({ provider_id }) => [
        provider_id,
        {
          provider_id,
          displayName: provider_id,
        } satisfies ScannedProvider,
      ]),
    ),
    endpoints: new Map(active.map((item) => [item.id, item])),
  })

  const baselineIds = ['author/baseline', 'author/vintage']
  const allIds = [...baselineIds, 'author/new']
  const allEndpoints = [baselineEndpoint, vintageEndpoint, newEndpoint]
  const baseline = makeScan(0, [baselineEndpoint], baselineIds)

  const timeline = [
    baseline,
    makeScan(1, allEndpoints, allIds),
    makeScan(2, [], allIds),
    makeScan(3, allEndpoints, allIds),
    // Same UUID moves to an exact variant and a new provider without being unlisted.
    makeScan(
      4,
      [endpoint('new', 'author/new:free', 'other-provider')],
      [...allIds, 'author/new:free'],
    ),
    // Nonstandard variant disappears from the model list; standard records remain.
    makeScan(5, [], allIds),
    makeScan(6, allEndpoints, allIds),
  ]

  // Historical-only model metadata changes as endpoints arrive; first observation must survive.
  for (const scan of timeline.slice(1)) {
    scan.models.set('author/vintage', { ...model('author/vintage'), short_name: 'Vintage renamed' })
  }

  await handler(models.initialize)(ctx, { rows: models.initialRows(baseline) })
  await handler(providers.initialize)(ctx, { rows: providers.initialRows(baseline) })
  await handler(endpoints.initialize)(ctx, { rows: endpoints.initialRows(baseline) })
  await handler(listings.initialize)(ctx, { rows: listings.initialRows(baseline) })

  const commitEvents = handler(commit)
  const pending: Parameters<typeof commitEvents>[] = []

  for (const [i, next] of timeline.entries()) {
    const previous = timeline[i - 1]

    if (previous === undefined) {
      continue
    }

    const pair = { previous, next }

    const args = {
      from_scan_at: previous.scan_at,
      scan_at: next.scan_at,
      models: models.prepare(pair),
      providers: providers.prepare(pair),
      endpoints: endpoints.prepare(pair),
      listings: listings.prepare(pair),
      stats: stats.prepare(next.endpoints.values()),
    }

    if (i === 1) {
      const before = structuredClone(tables)

      await rejects(
        handler(commitIngestion)(ctx, {
          ...args,
          listings: args.listings.map((row) => ({ ...row, scan_at: previous.scan_at })),
        }),
        /Listing output does not match its ingestion/,
      )

      expect(tables).toEqual(before)
    }

    const work = await handler(commitIngestion)(ctx, args)

    if (work === null) {
      throw new Error('Expected accepted work')
    }

    expect(rows('v4_current_stats_snapshot')).toMatchObject([
      { scan_at: next.scan_at, rows: args.stats },
    ])
    expect(await handler(commitIngestion)(ctx, args)).toBeNull()
    expect(rows('v4_processor_work').some((row) => row.processor === 'listings')).toBe(false)

    expect(
      rows('v4_endpoint_listing_history').filter((row) => row.scan_at === next.scan_at),
    ).toHaveLength(args.listings.length)

    pending.push([ctx, { ...args, work_id: work.events, rows: prepare(pair) }])
  }

  // Complete Events newest first: future listings must not establish prior knowledge.
  for (const args of pending.toReversed()) {
    await commitEvents(...args)
    await commitEvents(...args)
  }

  const events = rows('v4_events') as unknown as EventRow[]
  const at = (hour: number) => events.filter((row) => row.scan_at === timeline[hour]?.scan_at)
  expect(at(0)).toEqual([])

  expect(at(1).find((row) => row.entity_id === 'author/vintage')).toMatchObject({
    type: 'ADD',
    previously_known: true,
  })

  expect(at(1).find((row) => row.entity_id === 'author/new')).toMatchObject({
    type: 'ADD',
    previously_known: false,
  })

  expect(
    at(1)
      .filter((row) => row.entity_kind !== 'model')
      .every((row) => row.previously_known === false),
  ).toBe(true)

  expect(at(2).filter((row) => row.entity_kind === 'model')).toHaveLength(3)

  expect(at(2).every((row) => row.type === 'REMOVE' && row.previously_known === undefined)).toBe(
    true,
  )
  for (const hour of [3, 6]) {
    expect(at(hour)).toHaveLength(8)
    expect(at(hour).every((row) => row.type === 'ADD' && row.previously_known === true)).toBe(true)
  }
  for (const expected of [
    { entity_kind: 'endpoint', entity_id: 'new', type: 'UPDATE' },
    { entity_kind: 'model', entity_id: 'author/new', type: 'REMOVE' },
    {
      entity_kind: 'model',
      entity_id: 'author/new:free',
      type: 'ADD',
      previously_known: false,
    },
    {
      entity_kind: 'provider',
      entity_id: 'other-provider',
      type: 'ADD',
      previously_known: false,
    },
  ]) {
    expect(
      at(4).find(
        (row) => row.entity_kind === expected.entity_kind && row.entity_id === expected.entity_id,
      ),
    ).toMatchObject(expected)
  }
  expect(at(5).find((row) => row.entity_kind === 'model')?.entity_id).toBe('author/new:free')

  const urls = { publicUrl: 'https://orca.orb.town', logoOrigin: 'https://logos.orb.town' }
  for (const event of events) {
    const feed = render(event)
    const card = JSON.stringify(await renderDiscord(event, urls))

    if (event.type === 'ADD') {
      expect(feed?.previously_known).toBe(event.previously_known)

      if (event.previously_known === false) {
        expect(card.toLowerCase()).toContain('discovered')
      } else if (event.entity_kind === 'model') {
        expect(card).toContain('now has listed endpoints')
        expect(card).not.toContain('✨')
      } else {
        expect(card).toContain(
          event.entity_kind === 'endpoint' ? 'endpoint relisted.' : 'listed endpoints again',
        )
      }
    }
  }

  for (const [table, idField, identity, firstHour] of [
    ['v4_models', 'model_id', 'author/baseline', 0],
    ['v4_models', 'model_id', 'author/vintage', 0],
    ['v4_models', 'model_id', 'author/new', 1],
    ['v4_models', 'model_id', 'author/new:free', 4],
    ['v4_providers', 'provider_id', 'baseline-provider', 0],
    ['v4_providers', 'provider_id', 'new-provider', 1],
    ['v4_endpoints', 'endpoint_id', 'baseline', 0],
    ['v4_endpoints', 'endpoint_id', 'vintage', 1],
    ['v4_endpoints', 'endpoint_id', 'new', 1],
  ] as const) {
    expect(rows(table).find((row) => row[idField] === identity)?.from_scan_at).toBe(
      timeline[firstHour]?.scan_at,
    )
  }

  // Existing rows without a first-observation date stay unknown; incoming rows cannot invent it.
  const legacy = ['v4_models', 'v4_providers', 'v4_endpoints'].map((table) => {
    const [row] = rows(table)

    if (row === undefined) {
      throw new Error('Missing baseline row')
    }

    Reflect.deleteProperty(row, 'from_scan_at')
    return row._id
  })

  const newer = { ...baseline, scan_at: '2026-09-30T07:00:00.000Z' }

  await models.write(
    ctx,
    models.initialRows(newer).map((row) => ({ ...row, from_scan_at: newer.scan_at })),
  )

  await providers.write(
    ctx,
    providers.initialRows(newer).map((row) => ({ ...row, from_scan_at: newer.scan_at })),
  )

  await endpoints.write(
    ctx,
    endpoints.initialRows(newer).map((row) => ({ ...row, from_scan_at: newer.scan_at })),
  )

  for (const [i, table] of ['v4_models', 'v4_providers', 'v4_endpoints'].entries()) {
    expect(rows(table)[0]?._id).toBe(legacy[i])
    expect(rows(table)[0]?.scan_at).toBe(newer.scan_at)
    expect(rows(table)[0]?.from_scan_at).toBeUndefined()
  }
})

function render(row: EventRow) {
  const alert = prepareAlert(row)

  return alert === null ? null : renderPrepared(alert)
}

async function renderDiscord(row: EventRow, urls: DiscordUrls) {
  const { alerts } = await prepareBatch([{ ...row, _id: 'test-event' }])

  return renderDiscordBatch(alerts, urls)[0]?.message ?? null
}

async function prepareBatch(rows: (EventRow & { _id: string })[]) {
  return await prepareDiscordBatch(rows, async (candidates) => candidates.map(() => false))
}
