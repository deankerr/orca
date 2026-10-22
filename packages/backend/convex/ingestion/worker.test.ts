import { afterEach, beforeEach, expect, jest, spyOn, test } from 'bun:test'
import { rejects } from 'node:assert/strict'

import type { WorkId } from '@convex-dev/workpool'
import * as R from 'remeda'

import { internal } from '#generated/api'
import * as scans from '#scans'

import {
  CURRENT_ENDPOINTS_TABLE,
  CURRENT_MODELS_TABLE,
  CURRENT_PROVIDERS_TABLE,
  CURRENT_STATS_TABLE,
} from '../catalog/tables/current'
import { EVENTS_TABLE } from '../catalog/tables/events'
import { OBSERVATIONS_TABLE } from '../catalog/tables/observations'
import { ENDPOINT_PRICES_TABLE } from '../catalog/tables/pricing'
import { ENDPOINT_STATS_TABLE } from '../catalog/tables/stats'
import { setup } from '../harness.testing'
import type { Harness } from '../harness.testing'
import { canonicalJson } from '../products/discord/render'
import type { CurrentScope } from './operators/current'
import { currentTables, expectedCurrent } from './operators/current.testing'
import * as currentEndpoints from './operators/currentEndpoints'
import * as currentStats from './operators/currentStats'
import * as events from './operators/events'
import * as observations from './operators/observations'
import * as pricingHistory from './operators/pricingHistory'
import * as statsHistory from './operators/statsHistory'
import { hour, rawScan, scan, specs } from './operators/testing'
import { RETRY_BATCH, scheduleQueue } from './queue'
import { recordCounts, writeRecords } from './records'
import {
  INGESTION_RECORDS_TABLE,
  PROCESS_COMMITS_TABLE,
  QUEUE_SCHEDULE_TABLE,
  recordKind,
  recordState,
} from './tables'

const RETIRED_AT = 20

/** Random scans, plus an endpoint whose only departure is at `RETIRED_AT`. */
const SPECS = specs(7, 40).map((spec, index) =>
  index < RETIRED_AT
    ? { ...spec, endpoints: { ...spec.endpoints, retired: { model: 'm9', provider: 'p9' } } }
    : spec,
)
const environment = [
  'ORCA_OBJECTS_SOURCE_DEPLOYMENT',
  'ORCA_OBJECTS_BACKEND',
  'ORCA_INGESTION_CRON_ENABLED',
  'ORCA_DISCORD_AUTO_SEND_ENABLED',
] as const
let previous: Record<string, string | undefined>

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(Date.parse(hour(48)))
  previous = Object.fromEntries(environment.map((key) => [key, process.env[key]]))
  for (const key of environment) {
    Reflect.deleteProperty(process.env, key)
  }
})

afterEach(() => {
  jest.restoreAllMocks()
  jest.clearAllTimers()
  jest.useRealTimers()

  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key)
    } else {
      process.env[key] = value
    }
  }
})

/** Collect scans through the real object store. */
async function collect(t: Harness, indexes: number[]) {
  await t.action(async (ctx) => {
    for (const index of indexes) {
      await scans.store(ctx, rawScan(hour(index), SPECS[index]))
    }
  })
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i)

/** Save the target, then kick off sync as a separate operation. */
async function target(t: Harness, from: number, to: number) {
  await t.mutation(internal.ingestion.target.set, { start_at: hour(from), end_at: hour(to) })
  await t.mutation(internal.ingestion.sync.run, {})
}

/** Run registration, queueing, Workpool execution, and completions until nothing is scheduled. */
async function settle(t: Harness) {
  // Workpool and the aggregate's batch worker keep monitors armed minutes ahead.
  await t.finishAllScheduledFunctions(() => {
    jest.advanceTimersByTime(60_000)
  }, 1000)
  await expectCountsMatch(t)
}

/** The aggregate must count exactly the records in each kind and state once its queue drains. */
async function expectCountsMatch(t: Harness) {
  const { counted, actual } = await t.run(async (ctx) => {
    const all = await ctx.db.query(INGESTION_RECORDS_TABLE).collect()
    const keys = recordKind.members.flatMap((kind) =>
      recordState.members.map((state) => [kind.value, state.value] as const),
    )
    const totals = await recordCounts.countBatch(
      ctx,
      keys.map((namespace) => ({ namespace: [...namespace] })),
    )
    return {
      counted: Object.fromEntries(keys.map((key, index) => [key.join('/'), totals[index]])),
      actual: Object.fromEntries(
        keys.map((key) => [
          key.join('/'),
          all.filter(({ kind, state }) => kind === key[0] && state === key[1]).length,
        ]),
      ),
    }
  })
  expect(counted).toEqual(actual)
}

async function records(t: Harness) {
  const all = await t.run(async (ctx) => await ctx.db.query(INGESTION_RECORDS_TABLE).collect())
  return all
    .map(({ from_scan_at, scan_at, alerts, state }) => ({ from_scan_at, scan_at, alerts, state }))
    .toSorted((a, b) => a.scan_at.localeCompare(b.scan_at) || (a.from_scan_at === null ? -1 : 1))
}

const strip = <T extends { _id: unknown; _creationTime: unknown }>(doc: T) =>
  R.omit(doc, ['_id', '_creationTime'])
/** Rows in a stable order with sorted keys, so stored documents and derived rows compare equal. */
const sorted = (rows: object[]): unknown[] =>
  rows
    .map((row) => canonicalJson(row))
    .toSorted()
    .map((text): unknown => JSON.parse(text))

/** Every projection table, as retained rows without document metadata. */
async function projections(t: Harness) {
  return await t.run(async (ctx) => {
    const read = async (table: Parameters<typeof ctx.db.query>[0]) => {
      const docs = await ctx.db.query(table).collect()
      return docs.map(strip)
    }

    return {
      models: await read(CURRENT_MODELS_TABLE),
      providers: await read(CURRENT_PROVIDERS_TABLE),
      endpoints: await read(CURRENT_ENDPOINTS_TABLE),
      currentStats: await read(CURRENT_STATS_TABLE),
      observations: sorted(await read(OBSERVATIONS_TABLE)),
      prices: sorted(await read(ENDPOINT_PRICES_TABLE)),
      stats: sorted(await read(ENDPOINT_STATS_TABLE)),
      events: sorted(await read(EVENTS_TABLE)),
    }
  })
}

/** The retained view a baseline at the first scan and pairs through the last must produce. */
function reference(from: number, to: number) {
  const window = range(from, to).map((index) => scan(hour(index), SPECS[index]))
  const sources = window.map((next, index) => ({ previous: window[index - 1] ?? null, next }))
  const pairs = sources.slice(1)
  const current = (name: string) => {
    const table = currentTables.find((item) => item.name === name)
    return table === undefined ? [] : [...expectedCurrent(table, window).values()]
  }
  const latest = sources.at(-1)

  return {
    models: current('models'),
    providers: current('providers'),
    endpoints: current('endpoints'),
    currentStats: latest === undefined ? [] : [currentStats.derive(latest)],
    observations: sorted(sources.flatMap(observations.derive)),
    prices: sorted(sources.flatMap(pricingHistory.derive)),
    stats: sorted(sources.flatMap(statsHistory.derive)),
    events: sorted(pairs.flatMap(events.derive)),
  }
}

/** Current versions record which commit won; compare facts, as `expectedCurrent` does. */
function unversioned<
  View extends {
    models: object[]
    providers: object[]
    endpoints: object[]
    currentStats: object[]
  },
>(view: View) {
  const facts = (rows: object[]) => sorted(rows.map((row) => ({ ...row, scan_at: null })))

  return {
    ...view,
    models: facts(view.models),
    providers: facts(view.providers),
    endpoints: facts(view.endpoints),
    currentStats: sorted(view.currentStats),
  }
}

const facts = async (t: Harness) => unversioned(await projections(t))
const expected = (from: number, to: number) => unversioned(reference(from, to))

test('bootstrap, backfill, and the baseline converge to the reference projection', async () => {
  const t = setup()
  await collect(t, range(0, 29))
  await target(t, 0, 29)
  await settle(t)

  const registry = await records(t)
  expect(registry).toHaveLength(30)
  expect(registry[0]).toEqual({
    from_scan_at: null,
    scan_at: hour(0),
    alerts: false,
    state: 'complete',
  })
  expect(registry.slice(1).every(({ state, alerts }) => state === 'complete' && !alerts)).toBe(true)
  expect(await facts(t)).toEqual(expected(0, 29))
})

test('new scans register as alerting forward pairs and extend the projection', async () => {
  const t = setup()
  await collect(t, range(0, 9))
  await target(t, 0, 12)
  await settle(t)

  await collect(t, range(10, 12))
  await t.mutation(internal.ingestion.sync.run, {})
  await settle(t)

  const registry = await records(t)
  expect(registry.filter(({ alerts }) => alerts).map(({ scan_at }) => scan_at)).toEqual(
    range(10, 12).map(hour),
  )
  expect(registry.every(({ state }) => state === 'complete')).toBe(true)
  expect(await facts(t)).toEqual(expected(0, 12))
})

test('moving the target start back withdraws the old baseline and installs one at the new start', async () => {
  // The old baseline never lists the retired endpoint; only the displacing pair records its departure.
  const start = RETIRED_AT

  const t = setup()
  await collect(t, range(0, 35))
  await target(t, start, 35)
  await settle(t)

  const [baseline] = await records(t)
  expect(baseline).toMatchObject({ from_scan_at: null, scan_at: hour(start) })
  expect(await facts(t)).toEqual(expected(start, 35))

  await target(t, 0, 35)
  await settle(t)

  const registry = await records(t)
  expect(registry.filter(({ from_scan_at }) => from_scan_at === null)).toEqual([
    { from_scan_at: null, scan_at: hour(0), alerts: false, state: 'complete' },
  ])
  expect(
    registry.find(({ scan_at, from_scan_at }) => scan_at === hour(start) && from_scan_at !== null),
  ).toMatchObject({ from_scan_at: hour(start - 1), state: 'complete' })
  expect(await facts(t)).toEqual(expected(0, 35))
})

test('the target start advances only while no registration reads an earlier scan', async () => {
  const t = setup()
  await collect(t, range(5, 9))
  await target(t, 0, 9)
  await settle(t)

  const [baseline] = await records(t)
  expect(baseline).toMatchObject({ from_scan_at: null, scan_at: hour(5) })

  await target(t, 5, 9)
  await settle(t)
  expect(await facts(t)).toEqual(expected(5, 9))

  await rejects(
    t.mutation(internal.ingestion.target.set, { start_at: hour(6), end_at: hour(9) }),
    /earliest registered scan/u,
  )
  await rejects(
    t.mutation(internal.ingestion.target.set, { start_at: hour(5), end_at: hour(8) }),
    /never retract/u,
  )
})

test('a failed request waits for an explicit retry, then completes without duplicating output', async () => {
  const t = setup()
  await collect(t, range(0, 8))

  const { load } = scans
  const broken = spyOn(scans, 'load').mockImplementation(async (ctx, scanAt) => {
    if (scanAt === hour(4)) {
      throw new Error('Source unavailable')
    }
    return await load(ctx, scanAt)
  })

  await target(t, 0, 8)
  await settle(t)

  const failed = await t.run(
    async (ctx) =>
      await ctx.db
        .query(INGESTION_RECORDS_TABLE)
        .withIndex('by_kind_and_state_and_scan_at', (q) =>
          q.eq('kind', 'pair').eq('state', 'failed'),
        )
        .collect(),
  )
  // Pairs reading the unavailable scan fail; the others, and the baseline, complete.
  expect(failed.map(({ scan_at }) => scan_at)).toEqual([hour(4), hour(5)])
  expect(failed[0]?.error).toContain('Source unavailable')

  broken.mockRestore()
  expect(await t.mutation(internal.ingestion.queue.retry, {})).toBe(2)
  expect(await t.mutation(internal.ingestion.queue.retry, {})).toBe(0)
  await settle(t)

  const settled = await records(t)
  expect(settled.every(({ state }) => state === 'complete')).toBe(true)
  expect(await facts(t)).toEqual(expected(0, 8))

  const receipts = await t.run(async (ctx) => await ctx.db.query(PROCESS_COMMITS_TABLE).collect())
  expect(receipts).toHaveLength(9 * 8)
})

test('a target edit waits for kickoff, and the cron kicks off only when enabled', async () => {
  const t = setup()
  await collect(t, range(0, 3))
  await t.mutation(internal.ingestion.target.set, { start_at: hour(0), end_at: hour(3) })
  await settle(t)
  expect(await records(t)).toEqual([])

  await t.mutation(internal.ingestion.sync.scheduled, {})
  await settle(t)
  expect(await records(t)).toEqual([])

  process.env.ORCA_INGESTION_CRON_ENABLED = 'true'
  await t.mutation(internal.ingestion.sync.scheduled, {})
  await settle(t)
  const registry = await records(t)
  expect(registry).toHaveLength(4)
  expect(registry.every(({ state }) => state === 'complete')).toBe(true)
})

test('completing an alerting pair schedules automatic Discord delivery', async () => {
  const t = setup()
  await collect(t, range(0, 9))
  await target(t, 0, 12)
  await settle(t)
  await collect(t, range(10, 12))
  await t.mutation(internal.ingestion.sync.run, {})
  await settle(t)

  const { delivered, alerting } = await t.run(async (ctx) => {
    const scheduled = await ctx.db.system.query('_scheduled_functions').collect()
    const all = await ctx.db.query(INGESTION_RECORDS_TABLE).collect()
    return {
      delivered: scheduled
        .filter(({ name }) => name.startsWith('products/discord/delivery'))
        .map(({ args }) => canonicalJson(args)),
      alerting: all
        .filter(({ alerts }) => alerts)
        .map(({ _id }) => canonicalJson([{ record_id: _id }])),
    }
  })

  expect(alerting).toHaveLength(3)
  expect(delivered.toSorted()).toEqual(alerting.toSorted())
})

test('retry-all reopens a full batch within one transaction', async () => {
  const t = setup()
  await t.run(async (ctx) => {
    await writeRecords(ctx, async (writer) => {
      for (const index of range(1, RETRY_BATCH + 1)) {
        await writer.insert({
          kind: 'pair',
          from_scan_at: hour(index - 1),
          scan_at: hour(index),
          alerts: false,
          state: 'failed',
          error: 'x'.repeat(4096),
        })
      }
    })
  })

  expect(await t.mutation(internal.ingestion.queue.retry, {})).toBe(RETRY_BATCH)
  expect(await t.mutation(internal.ingestion.queue.retry, {})).toBe(1)
})

test('completion commits before queue coordination and its wakeup survives until drained', async () => {
  const t = setup()
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Synthetic work ID isolates settlement from Workpool execution.
  const workId = 'completed-work' as WorkId
  const id = await t.run(
    async (ctx) =>
      await writeRecords(
        ctx,
        async (writer) =>
          await writer.insert({
            kind: 'pair',
            from_scan_at: hour(0),
            scan_at: hour(1),
            alerts: false,
            state: 'queued',
            work_id: workId,
          }),
      ),
  )

  await t.mutation(internal.ingestion.execute.onIngested, {
    workId,
    context: undefined,
    result: { kind: 'success', returnValue: [] },
  })

  await t.run(async (ctx) => {
    const record = await ctx.db.get(INGESTION_RECORDS_TABLE, id)
    expect(record?.state).toBe('complete')
    expect(await ctx.db.query(QUEUE_SCHEDULE_TABLE).unique()).toBeNull()
    const scheduled = await ctx.db.system.query('_scheduled_functions').collect()
    expect(
      scheduled.some(
        ({ name, state }) => name === 'ingestion/queue:wake' && state.kind === 'pending',
      ),
    ).toBe(true)
  })

  await settle(t)
  expect(
    await t.run(async (ctx) => await ctx.db.query(QUEUE_SCHEDULE_TABLE).unique()),
  ).not.toBeNull()
})

test('repeated wakeups leave at most one queue step waiting', async () => {
  const t = setup()
  const waiting = async () =>
    await t.run(async (ctx) => {
      const scheduled = await ctx.db.system.query('_scheduled_functions').collect()
      return scheduled.filter(
        ({ name, state }) => name === 'ingestion/queue:run' && state.kind === 'pending',
      ).length
    })

  for (const _ of range(1, 5)) {
    await t.mutation(internal.ingestion.queue.wake, {})
  }
  expect(await waiting()).toBe(1)

  await settle(t)
  await t.run(async (ctx) => {
    await scheduleQueue(ctx)
  })
  expect(await waiting()).toBe(1)
})

test('a retry assigned a broader scope writes past a narrower receipt', async () => {
  const t = setup()
  const source = { previous: scan(hour(0), SPECS[0]), next: scan(hour(1), SPECS[1]) }
  const write = async (scope: CurrentScope) =>
    await t.mutation(internal.ingestion.catalog.currentEndpoints.write, {
      process: 'currentEndpoints',
      scan_at: source.next.scan_at,
      scope,
      rows: currentEndpoints.derive(source, scope),
    })

  expect(await write('departures')).toBe('committed')
  expect(await write('departures')).toBe('already_committed')
  expect(await write('full')).toBe('committed')
  expect(await write('changes')).toBe('already_committed')

  const rows = await t.run(async (ctx) => await ctx.db.query(CURRENT_ENDPOINTS_TABLE).collect())
  const listed = rows.filter(({ unlisted_at }) => unlisted_at === undefined)
  expect(listed).toHaveLength(source.next.endpoints.size)
})
