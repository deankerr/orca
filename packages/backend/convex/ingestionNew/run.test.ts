import { afterEach, beforeEach, expect, jest, spyOn, test } from 'bun:test'
import { ok, rejects } from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { convexTest } from 'convex-test'
import type { GenericSchema, SchemaDefinition } from 'convex/server'

import { internal } from '#generated/api'
import type { Id } from '#generated/dataModel'
import type { RawScan } from '#scan/collection'
import * as scans from '#scanNew'

import { CURRENT_MODELS_TABLE } from '../catalogNew/tables/current'
import { ENDPOINT_LISTINGS_TABLE } from '../catalogNew/tables/listings'
import { createScanReader } from '../scanNew/reader'
import schema from '../schema'
import { pool } from './pool'
import { INGESTIONS_TABLE } from './table'

const workpoolPackage = fileURLToPath(import.meta.resolve('@convex-dev/workpool/package.json'))
const workpoolRoot = path.join(path.dirname(workpoolPackage), 'src/component')
const batchRoot = path.join(
  path.dirname(createRequire(workpoolPackage).resolve('@convex-dev/batch-worker/package.json')),
  'src/component',
)

function modules(root: string) {
  return Object.fromEntries(
    [...new Bun.Glob('**/*.{ts,js}').scanSync({ absolute: true, cwd: root })]
      .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.d.ts'))
      .map((file) => [file, async (): Promise<unknown> => await import(file)]),
  )
}

async function loadSchema(root: string) {
  const loaded: unknown = await import(path.join(root, 'schema.ts'))
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Bun loads actual component schemas because the packaged test helpers require Vite.
  return (loaded as { default: SchemaDefinition<GenericSchema, boolean> }).default
}

const workpoolSchema = await loadSchema(workpoolRoot)
const batchSchema = await loadSchema(batchRoot)

function setup() {
  const t = convexTest({
    schema,
    modules: modules(path.resolve(import.meta.dir, '..')),
    transactionLimits: true,
  })
  t.registerComponent('ingestionPool', workpoolSchema, modules(workpoolRoot))
  t.registerComponent('ingestionPool/batchWorker', batchSchema, modules(batchRoot))
  return t
}

type Harness = ReturnType<typeof setup>
const a = '2026-10-10T10:00:00.000Z'
const b = '2026-10-10T11:17:00.000Z'
const c = '2026-10-10T12:00:00.000Z'

function capture(scan_at: string, price = '1'): RawScan {
  return {
    scan_at,
    entries: [
      {
        model_id: 'author/model',
        variant: 'standard',
        model: {
          slug: 'author/model',
          permaslug: 'author/model-v1',
          short_name: 'Model',
          created_at: a,
          input_modalities: ['text'],
          output_modalities: ['text'],
        },
        endpoints: [
          {
            id: 'endpoint',
            model_variant_slug: 'author/model',
            variant: 'standard',
            provider_slug: 'provider',
            provider_display_name: 'Provider',
            provider_info: { slug: 'provider', displayName: 'Provider' },
            pricing: { discount: 0, prompt: price },
            stats: { p50_latency: 1 },
          },
        ],
      },
    ],
  }
}

function source(...captures: RawScan[]) {
  const stored = new Map(
    captures.map((scan) => [
      `scan.${scan.scan_at}.jsonl`,
      scan.entries.map((entry) => JSON.stringify(entry)).join('\n'),
    ]),
  )
  const reader = createScanReader({
    namesAtOrAfter: async ({ atOrAfter, limit }) =>
      [...stored.keys()]
        .toSorted()
        .filter((name) => name >= atOrAfter)
        .slice(0, limit),
    loadMany: async (identities) => identities.map(({ name }) => stored.get(name) ?? null),
  })
  spyOn(scans, 'reader').mockReturnValue(reader)
  return reader
}

async function record(t: Harness, ingestion_id: Id<typeof INGESTIONS_TABLE>) {
  const value = await t.query(internal.ingestionNew.state.get, { ingestion_id })
  ok(value)
  return value
}

async function owner(t: Harness, ingestion_id: Id<typeof INGESTIONS_TABLE>) {
  const value = await record(t, ingestion_id)
  ok(value.work_id)
  return { ingestion_id, work_id: value.work_id }
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(Date.parse(c))
  source()
})

afterEach(() => {
  jest.restoreAllMocks()
  jest.clearAllTimers()
  jest.useRealTimers()
})

test('registration deduplicates ownership and blocks a successor until finalization', async () => {
  const t = setup()
  const input = { from_scan_at: null, scan_at: a }
  const id = await t.mutation(internal.ingestionNew.state.register, input)
  const first = await record(t, id)
  expect(await t.mutation(internal.ingestionNew.state.register, input)).toBe(id)
  await t.mutation(internal.ingestionNew.state.recover, {})
  expect(await record(t, id)).toEqual(first)
  expect(await t.query(internal.ingestionNew.state.inspect, { ingestion_id: id })).toMatchObject({
    execution: 'pending',
  })
  await rejects(
    t.mutation(internal.ingestionNew.state.register, { from_scan_at: a, scan_at: b }),
    /Finish the current ingestion/,
  )
  await rejects(
    t.mutation(internal.ingestionNew.state.register, {
      from_scan_at: '2026-10-09T00:00:00.000Z',
      scan_at: a,
    }),
    /Source input differs/,
  )
})

test('Workpool applies a baseline and exact successor, finalizes ownership and advances the clock', async () => {
  const t = setup()
  source(capture(a), capture(b, '2'))
  const id = await t.action(internal.ingestionNew.run.run, {})
  ok(id)
  await t.finishAllScheduledFunctions(() => {
    jest.advanceTimersByTime(1000)
  })
  expect(await record(t, id)).toMatchObject({ stage: 'complete', from_scan_at: null, scan_at: a })
  expect(await record(t, id)).not.toHaveProperty('work_id')
  expect(await t.query(internal.ingestionNew.state.clock, {})).toBe(b)
  const latest = await t.query(internal.ingestionNew.state.latest, {})
  expect(latest).toMatchObject({ stage: 'complete', from_scan_at: a, scan_at: b })
  const rows = await t.run(async (ctx) => ({
    listings: await ctx.db.query('catalog_listing_history').collect(),
    pricing: await ctx.db.query('catalog_pricing_history').collect(),
    events: await ctx.db.query('catalog_events').collect(),
  }))
  expect(rows.listings).toHaveLength(1)
  expect(rows.pricing.map((row) => row.scan_at)).toEqual([a, b])
  expect(rows.events.length).toBeGreaterThan(0)
  expect(rows.events.every((row) => row.scan_at === b)).toBe(true)
})

test('partial application resumes after its committed prefix without duplicating history', async () => {
  const t = setup()
  source(capture(a))
  const id = await t.mutation(internal.ingestionNew.state.register, {
    from_scan_at: null,
    scan_at: a,
  })
  const work = await owner(t, id)
  await t.run(async (ctx) => {
    await ctx.db.patch(INGESTIONS_TABLE, id, { stage: 'currentStats' })
  })
  const listing = {
    scan_at: a,
    endpoint_id: 'endpoint',
    model_id: 'author/model',
    provider_id: 'provider',
    provider_tag: 'provider',
    state: 'listed' as const,
  }
  await t.mutation(internal.ingestionNew.listingHistory.write, { ...work, rows: [listing] })
  await t.mutation(internal.ingestionNew.listingHistory.write, { ...work, rows: [listing] })
  await t.action(internal.ingestionNew.run.apply, { ingestion_id: id })
  expect(await record(t, id)).toMatchObject({ stage: 'events' })
  expect(await t.query(internal.ingestionNew.state.clock, {})).toBeNull()
  expect(
    await t.run(async (ctx) => await ctx.db.query(ENDPOINT_LISTINGS_TABLE).collect()),
  ).toHaveLength(1)
  await t.mutation(internal.ingestionNew.state.onComplete, {
    workId: work.work_id,
    context: { ingestion_id: id },
    result: { kind: 'success', returnValue: null },
  })
  expect(await t.query(internal.ingestionNew.state.clock, {})).toBe(a)
  expect(await record(t, id)).not.toHaveProperty('work_id')
})

test('failed writes roll back both earlier row writes and the stage checkpoint', async () => {
  const t = setup()
  const id = await t.mutation(internal.ingestionNew.state.register, {
    from_scan_at: null,
    scan_at: a,
  })
  const work = await owner(t, id)
  const row = {
    model_id: 'duplicate',
    display_name: 'Model',
    slug: 'duplicate',
    permaslug: 'duplicate',
    variant: 'standard',
    input_modalities: ['text'],
    output_modalities: ['text'],
    or_created_at: a,
    scan_at: a,
    metadata_json: '{}',
  }
  await t.run(async (ctx) => {
    await ctx.db.insert(CURRENT_MODELS_TABLE, { ...row, first_scan_at: a })
    await ctx.db.insert(CURRENT_MODELS_TABLE, { ...row, first_scan_at: a })
  })
  await rejects(
    t.mutation(internal.ingestionNew.currentModels.write, {
      ...work,
      rows: [{ ...row, model_id: 'new' }, row],
    }),
  )
  expect(await record(t, id)).toMatchObject({ stage: null })
  expect(
    await t.run(
      async (ctx) =>
        await ctx.db
          .query(CURRENT_MODELS_TABLE)
          .withIndex('by_model_id', (q) => q.eq('model_id', 'new'))
          .unique(),
    ),
  ).toBeNull()
  await rejects(
    t.mutation(internal.ingestionNew.events.write, { ...work, rows: [] }),
    /does not follow/,
  )
})

test('terminal failure releases ownership and delayed workers or callbacks cannot change its replacement', async () => {
  const t = setup()
  const id = await t.mutation(internal.ingestionNew.state.register, {
    from_scan_at: null,
    scan_at: a,
  })
  const old = await owner(t, id)
  await t.mutation(internal.ingestionNew.currentModels.write, { ...old, rows: [] })
  const failure = {
    workId: old.work_id,
    context: { ingestion_id: id },
    result: { kind: 'failed' as const, error: 'terminated' },
  }
  await t.mutation(internal.ingestionNew.state.onComplete, failure)
  expect(await record(t, id)).toMatchObject({ stage: 'currentModels' })
  expect(await record(t, id)).not.toHaveProperty('work_id')
  await t.mutation(internal.ingestionNew.state.recover, {})
  const replacement = await owner(t, id)
  expect(replacement.work_id).not.toBe(old.work_id)
  await t.mutation(internal.ingestionNew.state.onComplete, failure)
  expect(await owner(t, id)).toEqual(replacement)
  await rejects(
    t.mutation(internal.ingestionNew.currentProviders.write, { ...old, rows: [] }),
    /no longer owns/,
  )
  await t.mutation(internal.ingestionNew.currentProviders.write, { ...replacement, rows: [] })
})

test('recovery reconciles a lost completion callback using finished Workpool state', async () => {
  const t = setup()
  source(capture(a))
  // Run the real worker without its callback to reproduce a lost finalization.
  const id = await t.run(async (ctx) => {
    const ingestion_id = await ctx.db.insert(INGESTIONS_TABLE, {
      from_scan_at: null,
      scan_at: a,
      stage: null,
    })
    const work_id = await pool.enqueueAction(ctx, internal.ingestionNew.run.apply, { ingestion_id })
    await ctx.db.patch(INGESTIONS_TABLE, ingestion_id, { work_id })
    return ingestion_id
  })
  await t.finishAllScheduledFunctions(() => {
    jest.advanceTimersByTime(1000)
  })
  expect(await record(t, id)).toMatchObject({ stage: 'events' })
  expect(await t.query(internal.ingestionNew.state.inspect, { ingestion_id: id })).toMatchObject({
    execution: 'finished',
  })
  await t.mutation(internal.ingestionNew.state.recover, {})
  expect(await record(t, id)).toMatchObject({ stage: 'complete' })
  expect(await record(t, id)).not.toHaveProperty('work_id')
  expect(await t.query(internal.ingestionNew.state.clock, {})).toBe(a)
})

test('exhausted Workpool retries release a partial input and recovery completes its remaining stages', async () => {
  const t = setup()
  source(capture(a))
  const duplicate = await t.run(async (ctx) => {
    await ctx.db.insert('catalog_current_stats', { scan_at: a, rows: [] })
    return await ctx.db.insert('catalog_current_stats', { scan_at: a, rows: [] })
  })
  const id = await t.action(internal.ingestionNew.run.run, {})
  ok(id)
  await t.finishAllScheduledFunctions(() => {
    jest.advanceTimersByTime(1000)
  })
  expect(await record(t, id)).toMatchObject({ stage: 'currentEndpoints' })
  expect(await record(t, id)).not.toHaveProperty('work_id')
  expect(await t.query(internal.ingestionNew.state.clock, {})).toBeNull()
  await t.run(async (ctx) => {
    await ctx.db.delete('catalog_current_stats', duplicate)
  })
  await t.mutation(internal.ingestionNew.state.recover, {})
  await t.finishAllScheduledFunctions(() => {
    jest.advanceTimersByTime(1000)
  })
  expect(await record(t, id)).toMatchObject({ stage: 'complete' })
  expect(await record(t, id)).not.toHaveProperty('work_id')
  expect(await t.query(internal.ingestionNew.state.clock, {})).toBe(a)
  expect(
    await t.run(async (ctx) => await ctx.db.query(ENDPOINT_LISTINGS_TABLE).collect()),
  ).toHaveLength(1)
})
