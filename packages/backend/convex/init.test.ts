import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { components, internal } from '#generated/api'

import { setup } from './harness.testing'
import { INGESTION_TARGET_TABLE } from './ingestion/tables'

const WEBHOOK_URL = 'https://discord.com/api/v10/webhooks/100000000000000001/test-token'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(Date.parse('2026-10-27T00:00:00Z'))
  vi.stubEnv('ORCA_DEV_DISCORD_ALERTS_WEBHOOK', undefined)
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

test('init subscribes the development webhook once and targets the last day once', async () => {
  vi.stubEnv('ORCA_DEV_DISCORD_ALERTS_WEBHOOK', WEBHOOK_URL)
  const t = setup()

  await t.mutation(internal.init.default, {})
  vi.setSystemTime(Date.parse('2026-10-28T00:00:00Z'))
  await t.mutation(internal.init.default, {})

  const webhooks = await t.query(components.discordSender.api.listWebhooks, {})
  expect(webhooks.map(({ topics, url }) => ({ topics, url }))).toEqual([
    { topics: ['ingestion'], url: WEBHOOK_URL },
  ])

  const target = await t.run(async (ctx) => await ctx.db.query(INGESTION_TARGET_TABLE).unique())
  expect(target).toMatchObject({
    end_at: '2026-10-27T00:00:00.000Z',
    start_at: '2026-10-26T00:00:00.000Z',
  })
})

test('init registers no webhook when none is configured', async () => {
  const t = setup()

  await t.mutation(internal.init.default, {})

  expect(await t.query(components.discordSender.api.listWebhooks, {})).toEqual([])
})
