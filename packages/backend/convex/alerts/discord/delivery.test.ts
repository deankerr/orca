/* oxlint-disable typescript/no-unsafe-type-assertion -- Rendering fixtures provide only the read context used by these events. */
import { expect, spyOn, test } from 'bun:test'
import { rejects } from 'node:assert/strict'

import type { Doc, Id } from '#generated/dataModel'
import type { QueryCtx } from '#generated/server'

import { compare } from '../../events/compare'
import type { EventRow } from '../../events/table'
import type { JsonValue } from '../../json'
import { canonicalJson, contentKey, renderEvents, renderRows } from './render'

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

function lifecycleRow(
  kind: EventRow['entity_kind'],
  type: EventRow['type'],
  id = `${kind}-${type}`,
): EventRow & { _id: string } {
  const context = {
    model: { model_id: 'author/model', display_name: 'Model' },
    provider: { provider_id: 'tenstorrent', display_name: 'Tenstorrent' },
    endpoint: {
      endpoint_id: id,
      provider_tag: 'tenstorrent/fp8',
      provider_display_name: 'Tenstorrent',
    },
  }
  const snapshots = {
    model: {
      ...context.model,
      slug: 'author/model',
      permaslug: 'author/model',
      variant: 'standard',
      or_created_at: '2026-09-01T00:00:00.000Z',
      input_modalities: ['text'],
      output_modalities: ['text'],
      metadata: {},
    },
    provider: { ...context.provider, metadata: {} },
    endpoint: {
      ...context.endpoint,
      model_id: context.model.model_id,
      provider_id: context.provider.provider_id,
      variant: 'standard',
      pricing: { discount: 0, meters: { prompt: '0.000001' } },
      metadata: {},
    },
  }
  const field = { provider: 'headquarters', model: 'description', endpoint: 'is_disabled' }[kind]
  const [change] =
    type === 'UPDATE'
      ? compare(
          { [id]: { metadata: { [field]: kind === 'endpoint' ? false : 'Old' } } },
          { [id]: { metadata: { [field]: kind === 'endpoint' ? true : 'New' } } },
        )
      : compare(
          type === 'REMOVE' ? { [id]: snapshots[kind] } : {},
          type === 'ADD' ? { [id]: snapshots[kind] } : {},
        )

  return {
    _id: id,
    entity_kind: kind,
    entity_id: id,
    type,
    scan_at: '2026-09-30T01:00:00.000Z',
    context,
    change_json: JSON.stringify(change),
  }
}

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

test('rendering reports suppressed source events and preserves deterministic ordering', async () => {
  const visible = [changed('first'), changed('second')]
  const hidden = row(
    'hidden',
    { pricing: { meters: { prompt: '1' } } },
    { pricing: { meters: { prompt: '1.001' } } },
  )
  const rows = [...visible, hidden]
  const ctx = {
    db: { get: async (_table: string, id: string) => rows.find((item) => item._id === id) ?? null },
  } as unknown as QueryCtx
  const request = spyOn(globalThis, 'fetch').mockRejectedValue(
    new Error('Rendering must never contact Discord'),
  )
  try {
    await withOrigins(async () => {
      const args = { event_ids: rows.map((item) => item._id) }
      const rendered = await renderEvents(ctx, args.event_ids)
      expect(rendered.messages).toHaveLength(2)
      expect(rendered.skippedEvents).toEqual([{ event_id: 'hidden', reason: 'ineligible' }])
      const reversed = await renderEvents(ctx, args.event_ids.toReversed())
      expect(reversed).toEqual(rendered)
      await rejects(renderEvents(ctx, ['missing' as Id<'v4_events'>]), /Event not found/)
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

test('Discord announces additions, updates and removals in dependency order regardless of input order', async () => {
  const rows = (['endpoint', 'model', 'provider'] as const).flatMap((kind) =>
    (['REMOVE', 'UPDATE', 'ADD'] as const).map((type) => lifecycleRow(kind, type)),
  )

  await withOrigins(async () => {
    const rendered = await renderRows({} as QueryCtx, rows)

    expect(rendered.skippedEvents).toEqual([])
    expect(rendered.messages.map(({ event_ids }) => event_ids)).toEqual([
      ['provider-ADD'],
      ['model-ADD'],
      ['endpoint-ADD'],
      ['provider-UPDATE'],
      ['model-UPDATE'],
      ['endpoint-UPDATE'],
      ['endpoint-REMOVE'],
      ['model-REMOVE'],
      ['provider-REMOVE'],
    ])
    expect(await renderRows({} as QueryCtx, rows.toReversed())).toEqual(rendered)
  })
})

test('individual and batched endpoint unlistings precede last-endpoint departures', async () => {
  await withOrigins(async () => {
    for (const count of [1, 3]) {
      const unlistings = Array.from({ length: count }, (_, i) =>
        lifecycleRow('endpoint', 'REMOVE', `endpoint-${i}`),
      )
      const rendered = await renderRows({} as QueryCtx, [
        lifecycleRow('provider', 'REMOVE'),
        changed('unrelated-update'),
        ...unlistings.toReversed(),
        lifecycleRow('model', 'REMOVE'),
      ])

      expect(rendered.messages.map(({ event_ids }) => event_ids)).toEqual([
        ['unrelated-update'],
        unlistings.map(({ _id }) => _id),
        ['model-REMOVE'],
        ['provider-REMOVE'],
      ])
      expect(rendered.messages.at(-1)?.payload).toContain('has no more listed endpoints')
    }
  })
})

test('scan chronology takes precedence over lifecycle order', async () => {
  const earlier = lifecycleRow('provider', 'REMOVE')
  const later = { ...lifecycleRow('endpoint', 'ADD'), scan_at: '2026-09-30T02:00:00.000Z' }

  await withOrigins(async () => {
    const rendered = await renderRows({} as QueryCtx, [later, earlier])

    expect(rendered.messages.map(({ event_ids }) => event_ids)).toEqual([
      [earlier._id],
      [later._id],
    ])
  })
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
