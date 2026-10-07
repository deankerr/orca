/* oxlint-disable typescript/no-unsafe-type-assertion -- Registered mutation/query handlers use small dependency doubles so tests cannot send Discord messages. */
import { expect, spyOn, test } from 'bun:test'
import { rejects } from 'node:assert/strict'

import type { RegisteredMutation, RegisteredQuery } from 'convex/server'

import type { Doc, Id } from '#generated/dataModel'
import type { MutationCtx, QueryCtx } from '#generated/server'

import { compare } from '../../events/compare'
import type { JsonValue } from '../../json'
import { admitAutomatic } from './admission'
import { commitPreparation, prepare, preview, retryPreparation, sendExamples } from './delivery'
import { canonicalJson, contentKey, renderRows } from './render'

function mutation<Args extends Record<string, unknown>, Result>(
  fn: RegisteredMutation<'internal', Args, Result>,
) {
  return (fn as unknown as { _handler: (ctx: MutationCtx, args: Args) => Promise<Result> })._handler
}
function query<Args extends Record<string, unknown>, Result>(
  fn: RegisteredQuery<'internal', Args, Result>,
) {
  return (fn as unknown as { _handler: (ctx: QueryCtx, args: Args) => Promise<Result> })._handler
}

function row(id: string, before: JsonValue, after: JsonValue): Doc<'v4_events'> {
  const [change] = compare({ [id]: before }, { [id]: after })
  return {
    _id: id as Id<'v4_events'>,
    _creationTime: 0,
    entity_kind: 'endpoint',
    entity_id: id,
    type: 'UPDATE',
    scan_at: '2026-09-30T01:00:00.000Z',
    context: {
      model: { model_id: 'author/model', display_name: 'Model' },
      provider: { provider_id: 'provider', display_name: 'Provider' },
      endpoint: {
        endpoint_id: id,
        provider_tag: 'provider/fp8',
        provider_display_name: 'Regional offering',
      },
    },
    change_json: JSON.stringify(change),
  }
}
const changed = (id: string) =>
  row(id, { metadata: { is_disabled: false } }, { metadata: { is_disabled: true } })

async function withOrigins(run: () => Promise<void>) {
  const before = { web: process.env.ORCA_WEB_ORIGIN, logo: process.env.ORCA_LOGO_ORIGIN }
  process.env.ORCA_WEB_ORIGIN = 'https://orca.orb.town'
  process.env.ORCA_LOGO_ORIGIN = 'https://logos.orb.town'
  try {
    await run()
  } finally {
    if (before.web === undefined) {
      delete process.env.ORCA_WEB_ORIGIN
    } else {
      process.env.ORCA_WEB_ORIGIN = before.web
    }
    if (before.logo === undefined) {
      delete process.env.ORCA_LOGO_ORIGIN
    } else {
      process.env.ORCA_LOGO_ORIGIN = before.logo
    }
  }
}

test('preview is query-only, reports suppressed source events, and replay archives its exact payloads for each destination', async () => {
  const visible = [changed('first'), changed('second')]
  const hidden = row(
    'hidden',
    { pricing: { meters: { prompt: '1' } } },
    { pricing: { meters: { prompt: '1.001' } } },
  )
  const rows = [...visible, hidden]
  const queued: Record<string, unknown>[] = []
  const ctx = {
    db: { get: async (_table: string, id: string) => rows.find((item) => item._id === id) ?? null },
    runMutation: async (_fn: unknown, args: Record<string, unknown>) => {
      queued.push(args)
      return `group-${queued.length}`
    },
  } as unknown as MutationCtx
  const request = spyOn(globalThis, 'fetch').mockRejectedValue(
    new Error('Rendering must never contact Discord'),
  )
  try {
    await withOrigins(async () => {
      const args = { event_ids: rows.map((item) => item._id) }
      const rendered = await query(preview)(ctx, args)
      expect(rendered.messages).toHaveLength(2)
      expect(rendered.skippedEvents).toEqual([{ event_id: 'hidden', reason: 'ineligible' }])
      const replay = await mutation(sendExamples)(ctx, {
        ...args,
        destinationKeys: ['dev-3', 'dev-4', 'dev-3'],
        sendAt: 42,
      })
      expect(replay).toMatchObject({ groupIds: ['group-1', 'group-2'], queued: 4, skipped: 1 })
      expect(queued).toHaveLength(2)
      for (const item of queued) {
        expect(item.messages).toEqual(
          rendered.messages.map(({ key, payload }) => ({ key, payload })),
        )
        expect(item.sendAt).toBe(42)
        expect(item.reference).toContain('first')
        expect(JSON.stringify(item.messages)).not.toContain('event_ids')
      }
      const reversed = await query(preview)(ctx, { event_ids: args.event_ids.toReversed() })
      expect(reversed).toEqual(rendered)
      await rejects(
        query(preview)(ctx, { event_ids: ['missing' as Id<'v4_events'>] }),
        /Event not found/,
      )
      await rejects(
        mutation(sendExamples)(ctx, { ...args, destinationKeys: [] }),
        /between 1 and 20/,
      )
    })
    expect(request).not.toHaveBeenCalled()
  } finally {
    request.mockRestore()
  }
})

test('content identities canonicalize objects but preserve message and array order', () => {
  expect(contentKey({ b: 2, a: { d: 4, c: 3 } })).toBe(contentKey({ a: { c: 3, d: 4 }, b: 2 }))
  expect(contentKey([1, 2])).not.toBe(contentKey([2, 1]))
  expect(canonicalJson({ embeds: [{ title: 'hello' }], content: 'header' })).toBe(
    '{"content":"header","embeds":[{"title":"hello"}]}',
  )
})

test('automatic admission captures routes and records work before scheduling; disabled admission does nothing', async () => {
  const previous = process.env.ORCA_DISCORD_AUTO_SEND_ENABLED
  const writes: unknown[] = []
  const input = { scan_at: '2020-01-01T00:00:00.000Z', event_ids: ['old-event' as Id<'v4_events'>] }
  const ctx = {
    db: {
      query: () => ({
        withIndex: () => ({ take: async () => [{ destinationKey: 'dev', maxAgeMs: 1000 }] }),
      }),
      insert: async (table: string, value: unknown) => {
        writes.push({ table, value })
        return 'preparation'
      },
    },
    scheduler: {
      runAfter: async (_delay: number, _fn: unknown, value: unknown) => {
        writes.push({ schedule: value })
      },
    },
  } as unknown as MutationCtx
  try {
    process.env.ORCA_DISCORD_AUTO_SEND_ENABLED = 'false'
    expect(await admitAutomatic(ctx, input)).toBeNull()
    expect(writes).toEqual([])
    process.env.ORCA_DISCORD_AUTO_SEND_ENABLED = 'true'
    expect(await admitAutomatic(ctx, input)).toBe('preparation' as Id<'discord_alert_preparations'>)
    expect(writes).toEqual([
      {
        table: 'discord_alert_preparations',
        value: {
          ...input,
          routes: [{ destinationKey: 'dev', maxAgeMs: 1000 }],
          state: 'pending',
          attempts: 0,
        },
      },
      { schedule: { preparationId: 'preparation' } },
    ])
    expect(await admitAutomatic(ctx, { ...input, event_ids: [] })).toBeNull()
    expect(writes).toHaveLength(2)
  } finally {
    if (previous === undefined) {
      delete process.env.ORCA_DISCORD_AUTO_SEND_ENABLED
    } else {
      process.env.ORCA_DISCORD_AUTO_SEND_ENABLED = previous
    }
  }
})

test('failed preparation is inspectable and retryable; historical scan time and expiry reach the queue unchanged', async () => {
  const preparationId = 'preparation' as Id<'discord_alert_preparations'>
  const event = changed('old-event')
  const work = {
    _id: preparationId,
    _creationTime: 0,
    scan_at: event.scan_at,
    event_ids: [event._id],
    routes: [{ destinationKey: 'dev', maxAgeMs: 3_600_000 }],
    state: 'pending',
    attempts: 0,
  }
  const patches: Record<string, unknown>[] = []
  const queued: Record<string, unknown>[] = []
  let failure: Error | null = new Error('Renderer failed')
  const ctx = {
    db: {
      get: async (table: string) => (table === 'v4_events' ? event : work),
      patch: async (_table: string, _id: string, values: Record<string, unknown>) => {
        patches.push(values)
        Object.assign(work, values)
      },
    },
    runMutation: async (_fn: unknown, args: Record<string, unknown>) => {
      if (failure !== null) {
        throw failure
      }
      queued.push(args)
      return 'group'
    },
    scheduler: { runAfter: async () => null },
  } as unknown as MutationCtx
  await mutation(prepare)(ctx, { preparationId })
  expect(work).toMatchObject({ state: 'failed', attempts: 1, error: 'Renderer failed' })
  await mutation(retryPreparation)(ctx, { preparationId })
  expect(work).toMatchObject({
    state: 'pending',
    routes: [{ destinationKey: 'dev', maxAgeMs: 3_600_000 }],
  })
  failure = null
  await withOrigins(async () => {
    await mutation(commitPreparation)(ctx, { preparationId })
  })
  expect(queued[0]).toMatchObject({
    sendAt: Date.parse(event.scan_at),
    maxAgeMs: 3_600_000,
    key: 'automatic-events',
  })
  expect(work).toMatchObject({
    state: 'complete',
    attempts: 2,
    groupIds: ['group'],
    skippedEvents: [],
  })
  const count = queued.length
  await mutation(commitPreparation)(ctx, { preparationId })
  expect(queued).toHaveLength(count)
})

test('identical legitimate notification bodies retain distinct deterministic keys inside a group', async () => {
  const event = changed('same-endpoint')
  const rows = [
    { ...event, _id: 'first' },
    { ...event, _id: 'second' },
  ]
  await withOrigins(async () => {
    const rendered = await renderRows({} as QueryCtx, rows)
    expect(rendered.messages).toHaveLength(2)
    expect(rendered.messages[0]?.payload).toBe(rendered.messages[1]?.payload)
    expect(rendered.messages[1]?.key).toBe(`${rendered.messages[0]?.key}:2`)
    expect(await renderRows({} as QueryCtx, rows.toReversed())).toEqual(rendered)
  })
})
