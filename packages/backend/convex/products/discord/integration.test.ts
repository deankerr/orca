import { afterEach, beforeEach, expect, jest, spyOn, test } from 'bun:test'
import { ok, rejects } from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import componentSchema from '@orca/discord-sender/schema'
import { convexTest } from 'convex-test'
import type { GenericSchema, SchemaDefinition } from 'convex/server'

import { components, internal } from '#generated/api'

import { ingestKeys } from '../../ingestionNew/table'
import schema from '../../schema'

const componentRoot = path.dirname(
  fileURLToPath(import.meta.resolve('@orca/discord-sender/schema')),
)
const workpoolPackage = createRequire(path.join(componentRoot, 'schema.ts')).resolve(
  '@convex-dev/workpool/package.json',
)
const workpoolRoot = path.join(path.dirname(workpoolPackage), 'src/component')
const batchRoot = path.join(
  path.dirname(createRequire(workpoolPackage).resolve('@convex-dev/batch-worker/package.json')),
  'src/component',
)

async function loadSchema(root: string) {
  const loaded: unknown = await import(path.join(root, 'schema.ts'))
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Installed component schemas are loaded dynamically because their bundled test helpers require Vite.
  return (loaded as { default: SchemaDefinition<GenericSchema, boolean> }).default
}

const workpoolSchema = await loadSchema(workpoolRoot)
const batchSchema = await loadSchema(batchRoot)

function modules(root: string) {
  return Object.fromEntries(
    [...new Bun.Glob('**/*.{ts,js}').scanSync({ absolute: true, cwd: root })]
      .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.d.ts'))
      .map((file) => [file, async (): Promise<unknown> => await import(file)]),
  )
}

function setup() {
  const t = convexTest({
    schema,
    modules: modules(path.resolve(import.meta.dir, '../..')),
    transactionLimits: true,
  })
  t.registerComponent('discordSender', componentSchema, modules(componentRoot))
  t.registerComponent('discordSender/workpool', workpoolSchema, modules(workpoolRoot))
  t.registerComponent('discordSender/workpool/batchWorker', batchSchema, modules(batchRoot))
  return t
}

type Harness = ReturnType<typeof setup>
const START = Date.parse('2026-10-07T12:00:00.000Z')
const pair = { from_scan_at: '2026-10-07T11:00:00.000Z', scan_at: '2026-10-07T11:50:00.000Z' }
const settings = {
  ORCA_DISCORD_AUTO_SEND_ENABLED: 'true',
  ORCA_WEB_ORIGIN: 'https://orca.orb.town',
  ORCA_LOGO_ORIGIN: 'https://logos.orb.town',
}
let previous: Record<string, string | undefined>

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(START)
  previous = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]))
  Object.assign(process.env, settings)
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

async function registerWebhook(t: Harness, name: string, topics = ['ingestion']) {
  return await t.mutation(components.discordSender.api.registerWebhook, {
    name,
    topics,
    url: `https://discord.com/api/v10/webhooks/100000000000000001/${name}-test-token`,
  })
}

async function pendingCommit(t: Harness, input = pair, eligible = true) {
  const ingestion_id = await t.run(
    async (ctx) =>
      await ctx.db.insert('scan_ingestions', {
        ...input,
        progress: { kind: 'pending', completed: ingestKeys.filter((key) => key !== 'events') },
      }),
  )

  return {
    ...input,
    ingestion_id,
    rows: [
      {
        scan_at: input.scan_at,
        entity_kind: 'endpoint' as const,
        entity_id: 'endpoint',
        type: 'UPDATE' as const,
        context: {
          model: { model_id: 'author/model', display_name: 'Model' },
          provider: { provider_id: 'provider', display_name: 'Provider' },
          endpoint: {
            endpoint_id: 'endpoint',
            provider_tag: 'provider',
            provider_display_name: 'Provider',
          },
        },
        change_json: JSON.stringify({
          type: 'UPDATE',
          key: 'endpoint',
          changes: eligible
            ? [
                {
                  type: 'UPDATE',
                  key: 'metadata',
                  changes: [{ type: 'UPDATE', key: 'is_disabled', value: true, oldValue: false }],
                },
              ]
            : [
                {
                  type: 'UPDATE',
                  key: 'pricing',
                  changes: [
                    {
                      type: 'UPDATE',
                      key: 'meters',
                      changes: [{ type: 'UPDATE', key: 'prompt', value: '1.001', oldValue: '1' }],
                    },
                  ],
                },
              ],
        }),
      },
    ],
  }
}

async function jobs(t: Harness) {
  const result = await t.query(components.discordSender.api.listJobs, {
    from: START,
    to: Date.now() + 1,
  })
  return result.jobs
}

// The parent action invokes these in separate steps. Tests call the scheduled
// mutation directly to inspect queued jobs without running live HTTP actions.
async function commitAndPrepareAlerts(
  t: Harness,
  input: Awaited<ReturnType<typeof pendingCommit>>,
) {
  const source_ids = await commit(t, input)
  await t.mutation(internal.products.discord.delivery.sendIngestionAlerts, {
    ingestion_id: input.ingestion_id,
  })
  return source_ids
}

test('events complete before separate alert delivery queues subscribed jobs; repeated commits do nothing', async () => {
  const t = setup()
  const webhookIds = await Promise.all(
    ['first', 'second'].map(async (name) => await registerWebhook(t, name)),
  )
  const input = await pendingCommit(t)
  const eventIds = await commit(t, input)
  expect(await jobs(t)).toEqual([])
  expect(await t.run(async (ctx) => await ctx.db.get(input.ingestion_id))).toMatchObject({
    progress: { kind: 'complete' },
  })
  await t.mutation(internal.products.discord.delivery.sendIngestionAlerts, {
    ingestion_id: input.ingestion_id,
  })
  const queued = await jobs(t)

  expect(eventIds).toHaveLength(1)
  expect(queued).toHaveLength(2)
  expect(new Set(queued.map((job) => job.webhookId))).toEqual(new Set(webhookIds))
  expect(queued[0]?.messages).toEqual(queued[1]?.messages)

  for (const job of queued) {
    expect(job.key).toBe(`ingestion:${pair.scan_at}`)
    expect(job.topic).toBe('ingestion')
    expect(job.expiresAt).toBe(Date.parse(pair.scan_at) + 3_600_000)
    expect(job.messages).toHaveLength(1)
    const [message] = job.messages
    ok(message?.kind === 'send')
    expect(message.payload).toContain('disabled')
    expect(message.payload).toContain(pair.scan_at)
  }

  expect(await commitAndPrepareAlerts(t, input)).toEqual([])
  expect(await jobs(t)).toEqual(queued)
  expect(await t.run(async (ctx) => await ctx.db.query('catalog_events').collect())).toHaveLength(1)
  expect(await t.run(async (ctx) => await ctx.db.get(input.ingestion_id))).toMatchObject({
    progress: { kind: 'complete' },
  })
})

test('ingestion excludes nonmatching and invalidated webhooks', async () => {
  const t = setup()
  const selected = await registerWebhook(t, 'subscribed')
  await registerWebhook(t, 'other-topic', ['status'])
  const invalidated = await registerWebhook(t, 'invalidated')
  await t.mutation(components.discordSender.api.invalidateWebhook, { webhookId: invalidated })

  await commitAndPrepareAlerts(t, await pendingCommit(t))

  const queued = await jobs(t)
  expect(queued).toHaveLength(1)
  expect(queued[0]?.webhookId).toBe(selected)
})

for (const scenario of ['disabled', 'no webhooks', 'filtered', 'empty'] as const) {
  test(`${scenario} ingestion completes without sender jobs`, async () => {
    const t = setup()

    if (scenario !== 'no webhooks') {
      await registerWebhook(t, 'first')
    }
    if (scenario === 'disabled') {
      process.env.ORCA_DISCORD_AUTO_SEND_ENABLED = 'false'
    }

    const input = await pendingCommit(t, pair, scenario !== 'filtered')
    if (scenario === 'empty') {
      input.rows = []
    }
    const ids = await commitAndPrepareAlerts(t, input)

    expect(ids).toHaveLength(scenario === 'empty' ? 0 : 1)
    expect(await jobs(t)).toEqual([])
    expect(await t.run(async (ctx) => await ctx.db.get(input.ingestion_id))).toMatchObject({
      progress: { kind: 'complete' },
    })
  })
}

test('historical ingestion never submits automatic jobs or contacts Discord', async () => {
  const t = setup()
  await registerWebhook(t, 'first')
  const input = await pendingCommit(t, {
    from_scan_at: '2026-09-30T00:00:00.000Z',
    scan_at: '2026-09-30T01:00:00.000Z',
  })
  const request = spyOn(globalThis, 'fetch').mockRejectedValue(
    new Error('Historical work must never send'),
  )
  await commitAndPrepareAlerts(t, input)
  expect(await jobs(t)).toEqual([])
  expect(request).not.toHaveBeenCalled()
})

test('a rejected alert submission rolls back fanout but preserves committed events and work', async () => {
  const t = setup()
  const first = await registerWebhook(t, 'first', [])
  await registerWebhook(t, 'second')
  const input = await pendingCommit(t)
  // A conflicting existing job exercises a real component error after the first
  // destination was submitted, proving the host/component transaction boundary.
  await t.mutation(components.discordSender.api.submitBatch, {
    key: `ingestion:${pair.scan_at}`,
    topic: 'ingestion',
    expiresAt: Date.parse(pair.scan_at) + 3_600_000,
    messages: [{ key: 'conflict', payload: '{"content":"different input"}' }],
  })
  await t.mutation(components.discordSender.api.setWebhookTopics, {
    webhookId: first,
    topics: ['ingestion'],
  })
  const before = await jobs(t)
  await commit(t, input)
  const committed = await ingestionState(t)

  await rejects(
    t.mutation(internal.products.discord.delivery.sendIngestionAlerts, {
      ingestion_id: input.ingestion_id,
    }),
    /different input/,
  )

  expect(await jobs(t)).toEqual(before)
  expect(await ingestionState(t)).toEqual(committed)
  expect(committed.events).toHaveLength(1)
  expect(committed.ingestions[0]?.progress.kind).toBe('complete')
})

test('a rendering error cannot undo the committed ingestion', async () => {
  const t = setup()
  await registerWebhook(t, 'first')
  const input = await pendingCommit(t)
  process.env.ORCA_WEB_ORIGIN = 'not-a-url'
  await commit(t, input)
  const committed = await ingestionState(t)

  await rejects(
    t.mutation(internal.products.discord.delivery.sendIngestionAlerts, {
      ingestion_id: input.ingestion_id,
    }),
  )

  expect(await jobs(t)).toEqual([])
  expect(await ingestionState(t)).toEqual(committed)
  expect(committed.events).toHaveLength(1)
  expect(committed.ingestions[0]?.progress.kind).toBe('complete')
})

async function commit(t: Harness, input: Awaited<ReturnType<typeof pendingCommit>>) {
  const before = await t.run(async (ctx) => await ctx.db.get(input.ingestion_id))
  await t.mutation(internal.ingestionNew.events.write, {
    ingestion_id: input.ingestion_id,
    rows: input.rows,
  })
  if (before?.progress.kind === 'complete') {
    return []
  }
  return await t.run(async (ctx) => {
    const rows = await ctx.db
      .query('catalog_events')
      .withIndex('by_scan_at', (q) => q.eq('scan_at', input.scan_at))
      .collect()
    return rows.map((row) => row._id)
  })
}

async function ingestionFor(_t: Harness, input: Awaited<ReturnType<typeof pendingCommit>>) {
  return input.ingestion_id
}

async function ingestionState(t: Harness) {
  return await t.run(async (ctx) => ({
    ingestions: await ctx.db.query('scan_ingestions').collect(),
    events: await ctx.db.query('catalog_events').collect(),
  }))
}

test('preparing historical alerts is read-only without destinations and matches a subsequent manual send', async () => {
  const t = setup()
  process.env.ORCA_DISCORD_AUTO_SEND_ENABLED = 'false'
  const input = await pendingCommit(t, {
    from_scan_at: '2026-09-30T00:00:00.000Z',
    scan_at: '2026-09-30T01:00:00.000Z',
  })
  const eventIds = await commit(t, input)
  const ingestion_id = await ingestionFor(t, input)
  const before = await ingestionState(t)
  const scheduled = await t.run(
    async (ctx) => await ctx.db.system.query('_scheduled_functions').collect(),
  )
  const request = spyOn(globalThis, 'fetch').mockRejectedValue(
    new Error('Preparation must never contact Discord'),
  )

  const prepared = await t.query(internal.products.discord.delivery.prepareIngestion, {
    ingestion_id,
  })

  expect(prepared.scan_at).toBe(input.scan_at)
  expect(prepared.messages).toHaveLength(1)
  expect(prepared.messages[0]?.source_ids).toEqual(eventIds)
  expect(prepared.messages[0]?.payload).toContain(input.scan_at)
  expect(prepared.skippedEvents).toEqual([])
  expect(await jobs(t)).toEqual([])
  expect(await ingestionState(t)).toEqual(before)
  expect(
    await t.run(async (ctx) => await ctx.db.system.query('_scheduled_functions').collect()),
  ).toEqual(scheduled)
  expect(request).not.toHaveBeenCalled()

  await registerWebhook(t, 'first')
  const sent = await t.mutation(internal.products.discord.delivery.sendIngestion, { ingestion_id })
  const queued = await jobs(t)

  expect(sent.jobIds).toHaveLength(1)
  expect(queued).toHaveLength(1)
  expect(queued[0]?.messages).toEqual(
    prepared.messages.map(({ key, payload }) => ({ kind: 'send', key, payload })),
  )
  expect(await ingestionState(t)).toEqual(before)
  expect(request).not.toHaveBeenCalled()
})

test('manual historical alerts render the original events with a fresh deadline and repeatable jobs', async () => {
  const t = setup()
  await registerWebhook(t, 'first')
  await registerWebhook(t, 'second')
  const input = await pendingCommit(t, {
    from_scan_at: '2026-09-30T00:00:00.000Z',
    scan_at: '2026-09-30T01:00:00.000Z',
  })
  await commitAndPrepareAlerts(t, input)
  const ingestion_id = await ingestionFor(t, input)
  const prepared = await t.query(internal.products.discord.delivery.prepareIngestion, {
    ingestion_id,
  })
  const originalJobs = await jobs(t)
  const originalState = await ingestionState(t)

  for (let iteration = 1; iteration <= 2; iteration += 1) {
    const result = await t.mutation(internal.products.discord.delivery.sendIngestion, {
      ingestion_id,
    })
    const queued = await jobs(t)
    const manualJobs = queued.filter((job) => result.jobIds.includes(job._id))

    expect(result.messageCount).toBe(1)
    expect(result.jobIds).toHaveLength(2)
    expect(queued).toHaveLength(iteration * 2)
    expect(manualJobs).toHaveLength(2)

    for (const job of manualJobs) {
      expect(job.expiresAt).toBe(START + 3_600_000)
      expect(job.messages).toEqual(
        prepared.messages.map(({ key, payload }) => ({ kind: 'send', key, payload })),
      )
      const [message] = job.messages
      ok(message?.kind === 'send')
      expect(message.payload).toContain(input.scan_at)
    }

    expect(
      queued.filter((job) => originalJobs.some((original) => original._id === job._id)),
    ).toEqual(originalJobs)
    expect(await ingestionState(t)).toEqual(originalState)
  }
})

test('manual alerts send while automatic ingestion alerts are disabled', async () => {
  const t = setup()
  process.env.ORCA_DISCORD_AUTO_SEND_ENABLED = 'false'
  await registerWebhook(t, 'first')
  const input = await pendingCommit(t)
  await commitAndPrepareAlerts(t, input)
  expect(await jobs(t)).toEqual([])

  const result = await t.mutation(internal.products.discord.delivery.sendIngestion, {
    ingestion_id: await ingestionFor(t, input),
  })

  expect(result.jobIds).toHaveLength(1)
  expect(result.messageCount).toBe(1)
  expect(await jobs(t)).toHaveLength(1)
})

for (const scenario of ['pending stages', 'missing ingestion'] as const) {
  test(`manual alerts reject ${scenario} without creating jobs`, async () => {
    const t = setup()
    await registerWebhook(t, 'first')
    const input = await pendingCommit(t)
    const ingestion_id = await ingestionFor(t, input)

    if (scenario === 'missing ingestion') {
      await t.run(async (ctx) => {
        await ctx.db.delete(ingestion_id)
      })
    }
    const before = await ingestionState(t)

    await rejects(
      t.mutation(internal.products.discord.delivery.sendIngestion, { ingestion_id }),
      /ingestion|events|complete/i,
    )
    await rejects(
      t.query(internal.products.discord.delivery.prepareIngestion, { ingestion_id }),
      /ingestion|events|complete/i,
    )

    expect(await jobs(t)).toEqual([])
    expect(await ingestionState(t)).toEqual(before)
  })
}

for (const scenario of ['filtered', 'empty', 'no webhooks'] as const) {
  test(`manual ${scenario} ingestion creates no jobs`, async () => {
    const t = setup()
    process.env.ORCA_DISCORD_AUTO_SEND_ENABLED = 'false'

    if (scenario !== 'no webhooks') {
      await registerWebhook(t, 'first')
    }

    const input = await pendingCommit(t, pair, scenario !== 'filtered')
    if (scenario === 'empty') {
      input.rows = []
    }
    await commitAndPrepareAlerts(t, input)
    const before = await ingestionState(t)
    const ingestion_id = await ingestionFor(t, input)
    const prepared = await t.query(internal.products.discord.delivery.prepareIngestion, {
      ingestion_id,
    })

    expect(prepared.scan_at).toBe(input.scan_at)
    expect(prepared.messages).toHaveLength(scenario === 'no webhooks' ? 1 : 0)
    expect(prepared.skippedEvents).toEqual(
      scenario === 'filtered'
        ? before.events.map((event) => ({ source_id: event._id, reason: 'ineligible' }))
        : [],
    )
    expect(await jobs(t)).toEqual([])
    expect(await ingestionState(t)).toEqual(before)

    const result = await t.mutation(internal.products.discord.delivery.sendIngestion, {
      ingestion_id,
    })

    expect(result.jobIds).toEqual([])
    expect(result.messageCount).toBe(scenario === 'no webhooks' ? 1 : 0)
    expect(await jobs(t)).toEqual([])
    expect(await ingestionState(t)).toEqual(before)
  })
}

test('automatic preparation waits for every projection and is scheduled once when observations finish last', async () => {
  const t = setup()
  const input = await pendingCommit(t)
  await t.run(async (ctx) => {
    await ctx.db.patch(input.ingestion_id, {
      progress: {
        kind: 'pending',
        completed: ingestKeys.filter((key) => key !== 'events' && key !== 'observations'),
      },
    })
  })
  await t.mutation(internal.ingestionNew.events.write, {
    ingestion_id: input.ingestion_id,
    rows: input.rows,
  })
  expect(
    await t.run(async (ctx) => await ctx.db.system.query('_scheduled_functions').collect()),
  ).toEqual([])
  await rejects(
    t.query(internal.products.discord.delivery.prepareIngestion, {
      ingestion_id: input.ingestion_id,
    }),
    /complete/,
  )

  await t.mutation(internal.ingestionNew.observations.write, {
    ingestion_id: input.ingestion_id,
    rows: [],
  })
  const scheduled = await t.run(
    async (ctx) => await ctx.db.system.query('_scheduled_functions').collect(),
  )
  expect(scheduled.map((row) => row.name).toSorted()).toEqual([
    'ingestionNew/run:enqueueNextInput',
    'products/discord/delivery:sendIngestionAlerts',
  ])
  await t.mutation(internal.ingestionNew.events.write, {
    ingestion_id: input.ingestion_id,
    rows: input.rows,
  })
  await t.mutation(internal.ingestionNew.observations.write, {
    ingestion_id: input.ingestion_id,
    rows: [],
  })
  expect(
    await t.run(async (ctx) => await ctx.db.system.query('_scheduled_functions').collect()),
  ).toEqual(scheduled)
})
