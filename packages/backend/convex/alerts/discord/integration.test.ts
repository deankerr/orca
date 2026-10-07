import { afterEach, beforeEach, expect, jest, test } from 'bun:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import componentSchema from '@orca/discord-delivery/schema'
import { convexTest } from 'convex-test'
import type { GenericSchema, SchemaDefinition } from 'convex/server'

import { components, internal } from '#generated/api'

import schema from '../../schema'

const componentRoot = path.dirname(
  fileURLToPath(import.meta.resolve('@orca/discord-delivery/schema')),
)
const batchRoot = path.join(
  componentRoot,
  '../../node_modules/@convex-dev/batch-worker/src/component',
)
const loadedBatchSchema: unknown = await import(path.join(batchRoot, 'schema.ts'))
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The installed component exports this schema; its bundled test helper requires Vite instead of Bun.
const batchSchema = loadedBatchSchema as { default: SchemaDefinition<GenericSchema, boolean> }
function modules(root: string) {
  return Object.fromEntries(
    [...new Bun.Glob('**/*.{ts,js}').scanSync({ absolute: true, cwd: root })]
      .filter((path) => !path.endsWith('.test.ts') && !path.endsWith('.d.ts'))
      .map((path) => [path, async (): Promise<unknown> => await import(path)]),
  )
}
function setup() {
  const t = convexTest({
    schema,
    modules: modules(path.resolve(import.meta.dir, '../..')),
    transactionLimits: true,
  })
  t.registerComponent('discordDelivery', componentSchema, modules(componentRoot))
  t.registerComponent('discordDelivery/batchWorker', batchSchema.default, modules(batchRoot))
  return t
}

const settings = {
  ORCA_DISCORD_AUTO_SEND_ENABLED: 'true',
  ORCA_WEB_ORIGIN: 'https://orca.orb.town',
  ORCA_LOGO_ORIGIN: 'https://logos.orb.town',
}
let previous: Record<string, string | undefined>
beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(Date.parse('2026-10-07T12:00:00.000Z'))
  previous = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]))
  Object.assign(process.env, settings)
})
afterEach(() => {
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

const pair = { from_scan_at: '2026-09-30T00:00:00.000Z', scan_at: '2026-09-30T01:00:00.000Z' }
async function commitEvent(t: ReturnType<typeof setup>) {
  const work_id = await t.run(async (ctx) => {
    const ingestion_id = await ctx.db.insert('v4_scan_ingestions', pair)
    return await ctx.db.insert('v4_processor_work', {
      ingestion_id,
      scan_at: pair.scan_at,
      processor: 'events',
      state: 'pending',
    })
  })
  await t.mutation(internal.events.ingest.commit, {
    ...pair,
    work_id,
    rows: [
      {
        scan_at: pair.scan_at,
        entity_kind: 'endpoint',
        entity_id: 'endpoint',
        type: 'UPDATE',
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
          changes: [
            {
              type: 'UPDATE',
              key: 'metadata',
              changes: [{ type: 'UPDATE', key: 'is_disabled', value: true, oldValue: false }],
            },
          ],
        }),
      },
    ],
  })
  const preparations = await t.query(internal.alerts.discord.delivery.preparations, {})
  const [preparation] = preparations
  if (preparation === undefined) {
    throw new Error('Expected preparation committed with event')
  }
  return preparation
}

test('event commit records its obligation and preparation rollback preserves all-or-nothing multi-destination enqueue', async () => {
  const t = setup()
  await t.mutation(components.discordDelivery.api.registerDestination, {
    key: 'first',
    url: 'https://example.test/first',
  })
  await t.run(async (ctx) => {
    await ctx.db.insert('discord_alert_routes', {
      destinationKey: 'first',
      enabled: true,
      maxAgeMs: 1000,
    })
    await ctx.db.insert('discord_alert_routes', {
      destinationKey: 'missing',
      enabled: true,
      maxAgeMs: 1000,
    })
  })
  const preparation = await commitEvent(t)
  expect(preparation.state).toBe('pending')
  expect(preparation.routes).toHaveLength(2)
  await t.mutation(internal.alerts.discord.delivery.prepare, { preparationId: preparation._id })
  expect(await t.query(components.discordDelivery.api.listGroups, {})).toEqual([])
  const failed = await t.query(internal.alerts.discord.delivery.preparations, { state: 'failed' })
  expect(failed).toHaveLength(1)
  expect(failed[0]?.error).toContain('destination')
  await t.mutation(components.discordDelivery.api.registerDestination, {
    key: 'missing',
    url: 'https://example.test/second',
  })
  await t.mutation(internal.alerts.discord.delivery.retryPreparation, {
    preparationId: preparation._id,
  })
  await t.mutation(internal.alerts.discord.delivery.prepare, { preparationId: preparation._id })
  await t.finishAllScheduledFunctions(() => {
    jest.runAllTimers()
  })
  const groups = await t.query(components.discordDelivery.api.listGroups, {})
  expect(groups).toHaveLength(2)
  for (const { group, task } of groups) {
    expect(group.sendAt).toBe(Date.parse(pair.scan_at))
    expect(group.expiresAt).toBe(Date.parse(pair.scan_at) + 1000)
    expect(task.status).toBe('expired')
    const messages = await t.query(components.discordDelivery.api.listMessages, {
      groupId: group._id,
    })
    expect(messages[0]?.message.payload).toContain('disabled')
  }
  const complete = await t.query(internal.alerts.discord.delivery.preparations, {
    state: 'complete',
  })
  expect(complete[0]?.groupIds).toHaveLength(2)
  await t.mutation(internal.alerts.discord.delivery.prepare, { preparationId: preparation._id })
  expect(await t.query(components.discordDelivery.api.listGroups, {})).toHaveLength(2)
})

test('an unconfigured automatic destination leaves a visible obligation that can capture routes on retry', async () => {
  const t = setup()
  const preparation = await commitEvent(t)
  await t.mutation(internal.alerts.discord.delivery.prepare, { preparationId: preparation._id })
  const failed = await t.query(internal.alerts.discord.delivery.preparations, { state: 'failed' })
  expect(failed[0]?.error).toContain('No automatic Discord destinations')
  await t.mutation(internal.alerts.discord.destinations.register, {
    key: 'first',
    url: 'https://example.test/first',
  })
  await t.mutation(internal.alerts.discord.destinations.configureRoute, {
    destinationKey: 'first',
    enabled: true,
  })
  await t.mutation(internal.alerts.discord.delivery.retryPreparation, {
    preparationId: preparation._id,
  })
  await t.mutation(internal.alerts.discord.delivery.prepare, { preparationId: preparation._id })
  expect(
    await t.query(internal.alerts.discord.delivery.preparations, { state: 'complete' }),
  ).toHaveLength(1)
})
