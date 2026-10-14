import { afterEach, beforeEach, expect, jest, spyOn, test } from 'bun:test'
import { ok, rejects } from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { convexTest } from 'convex-test'
import type { GenericSchema, SchemaDefinition } from 'convex/server'

import { internal } from '#generated/api'
import type { Id } from '#generated/dataModel'
import * as objects from '#objects'
import type { RawScan } from '#scans/collection'

import { CURRENT_MODELS_TABLE } from '../catalog/tables/current'
import { OBSERVATIONS_TABLE } from '../catalog/tables/observations'
import schema from '../schema'
import { REGISTRATIONS_TABLE, ingestionProcesses } from './table'

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
  spyOn(objects, 'namesAtOrAfter').mockImplementation(async (_, { atOrAfter, limit, order }) => {
    const names = [...stored.keys()].toSorted().filter((name) => name >= atOrAfter)
    return (order === 'desc' ? names.toReversed() : names).slice(0, limit)
  })
  spyOn(objects, 'loadMany').mockImplementation(async (_, identities) =>
    identities.map(({ name }) => stored.get(name) ?? null),
  )
}

async function record(t: Harness, registration_id: Id<typeof REGISTRATIONS_TABLE>) {
  const value = await t.query(internal.ingestion.state.get, { registration_id })
  ok(value)
  return value
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

test('one selected capture establishes baseline state and stats without creation events', async () => {
  const t = setup()
  source(capture(a), capture(b))
  const id = await t.action(internal.ingestion.register.next, {
    start_at: '2026-10-10T11:00:00Z',
  })
  ok(id)
  const registration = await record(t, id)
  expect(registration).toMatchObject({ from_scan_at: null, scan_at: b })

  await t.finishAllScheduledFunctions(() => {
    jest.advanceTimersByTime(1000)
  })
  expect(await t.query(internal.ingestion.state.clock, {})).toBe(b)
  const rows = await t.run(async (ctx) => ({
    models: await ctx.db.query('catalog_current_models').collect(),
    providers: await ctx.db.query('catalog_current_providers').collect(),
    endpoints: await ctx.db.query('catalog_current_endpoints').collect(),
    observations: await ctx.db.query('catalog_observations').collect(),
    pricing: await ctx.db.query('catalog_pricing_history').collect(),
    stats: await ctx.db.query('catalog_stats_history').collect(),
    currentStats: await ctx.db.query('catalog_current_stats').unique(),
    events: await ctx.db.query('catalog_events').collect(),
  }))

  for (const entities of [rows.models, rows.providers, rows.endpoints]) {
    expect(entities).toHaveLength(1)
    expect(entities[0]).toMatchObject({ scan_at: b, first_scan_at: b })
  }

  for (const history of [rows.pricing, rows.stats]) {
    expect(history).toHaveLength(1)
    expect(history[0]?.scan_at).toBe(b)
  }

  expect(rows.observations).toMatchObject([
    {
      entity_kind: 'model',
      entity_id: 'author/model',
      scan_at: b,
      detected: true,
      endpoint_count: 1,
    },
    { entity_kind: 'provider', entity_id: 'provider', scan_at: b, endpoint_count: 1 },
    {
      entity_kind: 'endpoint',
      entity_id: 'endpoint',
      scan_at: b,
      detected: true,
      model_id: 'author/model',
      provider_id: 'provider',
      provider_tag: 'provider',
    },
  ])
  expect(rows.currentStats).toMatchObject({
    scan_at: b,
    rows: [{ endpoint_id: 'endpoint', p50_latency: 1 }],
  })
  expect(rows.events).toEqual([])
})

test.each(['2026-10-10', '2026-10-10T20:00:00+10:00'])(
  'baseline selection normalizes %s and includes an exact matching capture',
  async (start_at) => {
    const t = setup()
    source(capture('2026-10-09T23:59:59.000Z'), capture(a))
    const id = await t.action(internal.ingestion.register.next, { start_at })
    ok(id)
    expect(await record(t, id)).toMatchObject({ from_scan_at: null, scan_at: a })
  },
)

test('invalid or unavailable explicit baselines do not register work', async () => {
  const t = setup()
  source(capture(a))
  await rejects(t.action(internal.ingestion.register.next, { start_at: 'not-a-date' }))
  await rejects(t.action(internal.ingestion.register.next, { start_at: b }), /No baseline capture/)
  expect(await t.query(internal.ingestion.state.latest, {})).toBeNull()
  source()
  expect(await t.action(internal.ingestion.register.next, {})).toBeNull()
})

test('a registered baseline resumes its exact input and cannot be reset', async () => {
  const t = setup()
  source(capture(b))
  const id = await t.action(internal.ingestion.register.next, { start_at: b })
  ok(id)
  await t.mutation(internal.ingestion.events.write, { registration_id: id, rows: [] })
  source(capture(a), capture(b))
  await rejects(
    t.action(internal.ingestion.register.next, { start_at: a }),
    /start_at requires a fresh timeline/,
  )
  expect(await t.action(internal.ingestion.register.next, {})).toBe(id)
  await t.mutation(internal.init.default, {})
  await t.finishAllScheduledFunctions(() => {
    jest.advanceTimersByTime(1000)
  })
  expect(await t.query(internal.ingestion.state.clock, {})).toBe(b)
  expect(
    await t.run(async (ctx) => await ctx.db.query(REGISTRATIONS_TABLE).collect()),
  ).toHaveLength(1)
  await rejects(
    t.action(internal.ingestion.register.next, { start_at: b }),
    /start_at requires a fresh timeline/,
  )
})

test('preview bootstrap selects recent history through the new runner', async () => {
  const t = setup()
  source(capture('2026-10-01T00:00:00.000Z'), capture(a))
  await t.mutation(internal.init.default, {})
  await t.finishAllScheduledFunctions(() => {
    jest.advanceTimersByTime(1000)
  })
  expect(await t.query(internal.ingestion.state.latest, {})).toMatchObject({
    from_scan_at: null,
    scan_at: a,
    progress: { kind: 'complete' },
  })
})

test('concurrent requests cannot establish different baselines', async () => {
  const t = setup()
  source(capture(a), capture(b))
  const results = await Promise.allSettled([
    t.action(internal.ingestion.register.next, { start_at: a }),
    t.action(internal.ingestion.register.next, { start_at: b }),
  ])
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
  expect(
    await t.run(async (ctx) => await ctx.db.query(REGISTRATIONS_TABLE).collect()),
  ).toHaveLength(1)
})

test('a real empty previous scan still produces subsequent addition and removal events', async () => {
  const t = setup()
  source({ scan_at: a, entries: [] }, capture(b), { scan_at: c, entries: [] })
  await t.action(internal.ingestion.register.next, {})
  await t.finishAllScheduledFunctions(() => {
    jest.advanceTimersByTime(1000)
  })
  const rows = await t.run(async (ctx) => ({
    events: await ctx.db.query('catalog_events').collect(),
    endpoint: await ctx.db.query('catalog_current_endpoints').unique(),
  }))
  expect(rows.events.map(({ scan_at, type }) => ({ scan_at, type }))).toEqual([
    ...Array.from({ length: 3 }, () => ({ scan_at: b, type: 'ADD' as const })),
    ...Array.from({ length: 3 }, () => ({ scan_at: c, type: 'REMOVE' as const })),
  ])
  expect(rows.endpoint).toMatchObject({ first_scan_at: b, scan_at: b, unlisted_at: c })
  expect(await t.query(internal.ingestion.state.clock, {})).toBe(c)
})

test('overlapping registration keeps one input and blocks its successor until all processes commit', async () => {
  const t = setup()
  const input = { from_scan_at: null, scan_at: a }
  const ids = await Promise.all([
    t.mutation(internal.ingestion.register.scan, input),
    t.mutation(internal.ingestion.register.scan, input),
  ])
  const [id] = ids
  expect(ids).toEqual([id, id])
  await t.mutation(internal.ingestion.register.recover, {})
  expect(await record(t, id)).toMatchObject({ progress: { kind: 'pending', completed: [] } })
  expect(
    await t.run(async (ctx) => await ctx.db.query(REGISTRATIONS_TABLE).collect()),
  ).toHaveLength(1)
  await rejects(
    t.mutation(internal.ingestion.register.scan, { from_scan_at: a, scan_at: b }),
    /Complete the current registration/,
  )
  await rejects(
    t.mutation(internal.ingestion.register.scan, {
      from_scan_at: '2026-10-09T00:00:00.000Z',
      scan_at: a,
    }),
    /Selected scans differ/,
  )
  await rejects(
    t.mutation(internal.ingestion.register.scan, { from_scan_at: a, scan_at: a }),
    /move forward/,
  )
})

test('overlapping Workpool attempts complete a baseline and exact successor without duplicate output', async () => {
  const t = setup()
  source(capture(a), capture(b, '2'))
  const ids = await Promise.all([
    t.action(internal.ingestion.register.next, {}),
    t.action(internal.ingestion.register.next, {}),
  ])
  const [id] = ids
  ok(id)
  expect(ids).toEqual([id, id])
  await t.finishAllScheduledFunctions(() => {
    jest.advanceTimersByTime(1000)
  })
  expect(await record(t, id)).toMatchObject({
    progress: { kind: 'complete' },
    from_scan_at: null,
    scan_at: a,
  })
  expect(await t.query(internal.ingestion.state.clock, {})).toBe(b)
  expect(await t.query(internal.ingestion.state.latest, {})).toMatchObject({
    progress: { kind: 'complete' },
    from_scan_at: a,
    scan_at: b,
  })
  const rows = await t.run(async (ctx) => ({
    pricing: await ctx.db.query('catalog_pricing_history').collect(),
    stats: await ctx.db.query('catalog_stats_history').collect(),
    events: await ctx.db.query('catalog_events').collect(),
  }))
  expect(rows.pricing.map((row) => row.scan_at)).toEqual([a, b])
  expect(rows.stats.map((row) => row.scan_at)).toEqual([a, b])
  expect(rows.events).toHaveLength(1)
  expect(rows.events[0]?.scan_at).toBe(b)
  expect(
    await t.run(async (ctx) => await ctx.db.query('catalog_observations').collect()),
  ).toHaveLength(3)
})

test('independent processes commit in any order and repeated process calls retain output once', async () => {
  const t = setup()
  source(capture(a))
  const registration_id = await t.mutation(internal.ingestion.register.scan, {
    from_scan_at: null,
    scan_at: a,
  })
  const observation = {
    scan_at: a,
    entity_id: 'endpoint',
    model_id: 'author/model',
    provider_id: 'provider',
    provider_tag: 'provider',
    detected: true,
    entity_kind: 'endpoint' as const,
  }
  await Promise.all([
    t.mutation(internal.ingestion.events.write, { registration_id, rows: [] }),
    t.mutation(internal.ingestion.observations.write, { registration_id, rows: [observation] }),
    t.mutation(internal.ingestion.observations.write, { registration_id, rows: [observation] }),
  ])
  const registration = await record(t, registration_id)
  ok(registration.progress.kind === 'pending')
  expect(registration.progress.completed.toSorted()).toEqual(['events', 'observations'])
  expect(await t.query(internal.ingestion.state.clock, {})).toBeNull()
  await Promise.all([
    t.action(internal.ingestion.ingest.run, { registration_id }),
    t.action(internal.ingestion.ingest.run, { registration_id }),
  ])
  expect(await record(t, registration_id)).toMatchObject({ progress: { kind: 'complete' } })
  expect(await t.query(internal.ingestion.state.clock, {})).toBe(a)
  expect(await t.run(async (ctx) => await ctx.db.query(OBSERVATIONS_TABLE).collect())).toHaveLength(
    1,
  )
})

test('empty observation output completes the final process exactly once', async () => {
  const t = setup()
  const registration_id = await t.mutation(internal.ingestion.register.scan, {
    from_scan_at: null,
    scan_at: a,
  })
  await t.run(async (ctx) => {
    await ctx.db.patch(REGISTRATIONS_TABLE, registration_id, {
      progress: {
        kind: 'pending',
        completed: ingestionProcesses.filter((key) => key !== 'observations'),
      },
    })
  })
  expect(await t.query(internal.ingestion.state.clock, {})).toBeNull()
  const args = { registration_id, rows: [] }
  await Promise.all([
    t.mutation(internal.ingestion.observations.write, args),
    t.mutation(internal.ingestion.observations.write, args),
  ])
  expect(await record(t, registration_id)).toMatchObject({ progress: { kind: 'complete' } })
  expect(await t.query(internal.ingestion.state.clock, {})).toBe(a)
  const scheduled = await t.run(
    async (ctx) => await ctx.db.system.query('_scheduled_functions').collect(),
  )
  expect(scheduled.filter((job) => job.name === 'ingestion/register:next')).toHaveLength(1)
})

test('failed writes roll back rows and completion without disturbing other processes', async () => {
  const t = setup()
  const registration_id = await t.mutation(internal.ingestion.register.scan, {
    from_scan_at: null,
    scan_at: a,
  })
  await t.mutation(internal.ingestion.events.write, { registration_id, rows: [] })
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
    t.mutation(internal.ingestion.currentModels.write, {
      registration_id,
      rows: [{ ...row, model_id: 'new' }, row],
    }),
  )
  expect(await record(t, registration_id)).toMatchObject({
    progress: { kind: 'pending', completed: ['events'] },
  })
  expect(
    await t.run(
      async (ctx) =>
        await ctx.db
          .query(CURRENT_MODELS_TABLE)
          .withIndex('by_model_id', (q) => q.eq('model_id', 'new'))
          .unique(),
    ),
  ).toBeNull()
})

test('a failed early process lets all other processes finish and a retry only applies the unfinished process', async () => {
  const t = setup()
  source(capture(a))
  const registration_id = await t.mutation(internal.ingestion.register.scan, {
    from_scan_at: null,
    scan_at: a,
  })
  const duplicate = await t.run(async (ctx) => {
    const row = {
      model_id: 'author/model',
      display_name: 'Model',
      slug: 'author/model',
      permaslug: 'author/model-v1',
      variant: 'standard',
      input_modalities: ['text'],
      output_modalities: ['text'],
      or_created_at: a,
      scan_at: a,
      first_scan_at: a,
      metadata_json: '{}',
    }
    await ctx.db.insert(CURRENT_MODELS_TABLE, row)
    return await ctx.db.insert(CURRENT_MODELS_TABLE, row)
  })
  await rejects(t.action(internal.ingestion.ingest.run, { registration_id }), /unique/)
  const registration = await record(t, registration_id)
  ok(registration.progress.kind === 'pending')
  expect(registration.progress.completed.toSorted()).toEqual(
    ingestionProcesses.filter((key) => key !== 'currentModels').toSorted(),
  )
  expect(await t.query(internal.ingestion.state.clock, {})).toBeNull()
  await t.run(async (ctx) => {
    await ctx.db.delete(CURRENT_MODELS_TABLE, duplicate)
  })
  await t.action(internal.ingestion.ingest.run, { registration_id })
  expect(await record(t, registration_id)).toMatchObject({ progress: { kind: 'complete' } })
  expect(await t.query(internal.ingestion.state.clock, {})).toBe(a)
  expect(
    await t.run(async (ctx) => await ctx.db.query('catalog_stats_history').collect()),
  ).toHaveLength(1)
})

test('the last outstanding process completes the registration and schedules exactly one continuation', async () => {
  const t = setup()
  const registration_id = await t.mutation(internal.ingestion.register.scan, {
    from_scan_at: null,
    scan_at: a,
  })
  await t.run(async (ctx) => {
    await ctx.db.patch(REGISTRATIONS_TABLE, registration_id, {
      progress: {
        kind: 'pending',
        completed: ingestionProcesses.filter((key) => key !== 'statsHistory'),
      },
    })
  })
  const args = {
    registration_id,
    rows: [{ endpoint_id: 'endpoint', scan_at: a, tier: 'default', sample: { p50_latency: 1 } }],
  }
  await Promise.all([
    t.mutation(internal.ingestion.statsHistory.write, args),
    t.mutation(internal.ingestion.statsHistory.write, args),
  ])
  expect(await record(t, registration_id)).toMatchObject({ progress: { kind: 'complete' } })
  expect(await t.query(internal.ingestion.state.clock, {})).toBe(a)
  await t.mutation(internal.ingestion.statsHistory.write, args)
  await t.action(internal.ingestion.ingest.run, { registration_id })
  expect(
    await t.run(async (ctx) => await ctx.db.query('catalog_stats_history').collect()),
  ).toHaveLength(1)
  const scheduled = await t.run(
    async (ctx) => await ctx.db.system.query('_scheduled_functions').collect(),
  )
  expect(scheduled.filter((job) => job.name === 'ingestion/register:next')).toHaveLength(1)
  const successor = await t.mutation(internal.ingestion.register.scan, {
    from_scan_at: a,
    scan_at: b,
  })
  expect(await record(t, successor)).toMatchObject({ progress: { kind: 'pending', completed: [] } })
  expect(await t.query(internal.ingestion.state.clock, {})).toBe(a)
  await rejects(
    t.mutation(internal.ingestion.register.scan, { from_scan_at: a, scan_at: c }),
    /Complete the current registration/,
  )
})

test('exhausted Workpool retries preserve successful processes and recovery completes the registration', async () => {
  const t = setup()
  source(capture(a))
  const duplicate = await t.run(async (ctx) => {
    await ctx.db.insert('catalog_current_stats', { scan_at: a, rows: [] })
    return await ctx.db.insert('catalog_current_stats', { scan_at: a, rows: [] })
  })
  const id = await t.action(internal.ingestion.register.next, {})
  ok(id)
  await t.finishAllScheduledFunctions(() => {
    jest.advanceTimersByTime(1000)
  })
  const registration = await record(t, id)
  ok(registration.progress.kind === 'pending')
  expect(registration.progress.completed.toSorted()).toEqual(
    ingestionProcesses.filter((key) => key !== 'currentStats').toSorted(),
  )
  expect(await t.query(internal.ingestion.state.clock, {})).toBeNull()
  await t.run(async (ctx) => {
    await ctx.db.delete('catalog_current_stats', duplicate)
  })
  await t.mutation(internal.ingestion.register.recover, {})
  await t.finishAllScheduledFunctions(() => {
    jest.advanceTimersByTime(1000)
  })
  expect(await record(t, id)).toMatchObject({ progress: { kind: 'complete' } })
  expect(await t.query(internal.ingestion.state.clock, {})).toBe(a)
  expect(await t.run(async (ctx) => await ctx.db.query(OBSERVATIONS_TABLE).collect())).toHaveLength(
    3,
  )
})

test('scheduled admission requires the cron flag while continuations remain independent', async () => {
  const previous = process.env.ORCA_INGESTION_CRON_ENABLED
  const t = setup()
  source(capture(a), capture(b, '2'))

  try {
    delete process.env.ORCA_INGESTION_CRON_ENABLED
    await t.mutation(internal.ingestion.register.scheduled, {})
    process.env.ORCA_INGESTION_CRON_ENABLED = 'false'
    await t.mutation(internal.ingestion.register.scheduled, {})
    expect(
      await t.run(async (ctx) => await ctx.db.system.query('_scheduled_functions').collect()),
    ).toHaveLength(0)

    process.env.ORCA_INGESTION_CRON_ENABLED = 'true'
    await t.mutation(internal.ingestion.register.scheduled, {})
    const scheduled = await t.run(
      async (ctx) => await ctx.db.system.query('_scheduled_functions').collect(),
    )
    expect(scheduled.map((job) => job.name)).toEqual(['ingestion/register:next'])

    process.env.ORCA_INGESTION_CRON_ENABLED = 'false'
    await t.finishAllScheduledFunctions(() => {
      jest.advanceTimersByTime(1000)
    })
    expect(await t.query(internal.ingestion.state.clock, {})).toBe(b)
  } finally {
    if (previous === undefined) {
      delete process.env.ORCA_INGESTION_CRON_ENABLED
    } else {
      process.env.ORCA_INGESTION_CRON_ENABLED = previous
    }
  }
})
