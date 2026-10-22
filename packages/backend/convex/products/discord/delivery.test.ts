/* oxlint-disable typescript/no-unsafe-type-assertion -- Rendering fixtures provide only the read context used by these events. */
import { expect, jest, test } from 'bun:test'
import { ok } from 'node:assert/strict'

import type { Doc, Id } from '#generated/dataModel'
import type { QueryCtx } from '#generated/server'

import type { EventRow } from '../../catalog/tables/events'
import { EVENTS_TABLE } from '../../catalog/tables/events'
import { OBSERVATIONS_TABLE } from '../../catalog/tables/observations'
import type { ObservationRow } from '../../catalog/tables/observations'
import { compare } from '../../compare'
import { setup } from '../../harness.testing'
import { INGESTION_RECORDS_TABLE } from '../../ingestion/tables'
import type { JsonValue } from '../../json'
import type { AlertSource } from '../shared/alerts/read'
import { canonicalJson, contentKey, renderRows } from './render'

function row(id: string, before: JsonValue, after: JsonValue): Doc<'catalog_events'> {
  const [change] = compare({ [id]: before }, { [id]: after })
  return {
    _id: id as Id<'catalog_events'>,
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

const SCAN_AT = '2026-09-30T01:00:00.000Z'
const PREVIOUS_SCAN_AT = '2026-09-30T00:00:00.000Z'

type Kind = EventRow['entity_kind']
type Operation = EventRow['type']

/** Endpoint lifecycle and every update are Events; parent lifecycle is an endpoint-count observation. */
function lifecycleSource(kind: Kind, type: Operation, id = `${kind}-${type}`, scan_at = SCAN_AT) {
  const context = {
    model: { model_id: kind === 'model' ? id : 'author/model', display_name: 'Model' },
    provider: {
      provider_id: kind === 'provider' ? id : 'tenstorrent',
      display_name: 'Tenstorrent',
    },
    endpoint: {
      endpoint_id: id,
      provider_tag: 'tenstorrent/fp8',
      provider_display_name: 'Tenstorrent',
    },
  }

  // A parent update alerts only while the parent keeps serving.
  const previous: ObservationRow[] =
    kind === 'endpoint' || type === 'ADD'
      ? []
      : [
          {
            entity_kind: kind,
            entity_id: id,
            scan_at: PREVIOUS_SCAN_AT,
            endpoint_count: 1,
            previous_endpoint_count: null,
          },
        ]

  if (kind !== 'endpoint' && type !== 'UPDATE') {
    const observation: ObservationRow = {
      entity_kind: kind,
      entity_id: id,
      scan_at,
      endpoint_count: type === 'ADD' ? 1 : 0,
      previous_endpoint_count: type === 'ADD' ? 0 : 1,
    }
    return { previous, row: { table: OBSERVATIONS_TABLE, value: observation } } as const
  }

  const snapshot = {
    ...context.endpoint,
    model_id: context.model.model_id,
    provider_id: context.provider.provider_id,
    variant: 'standard',
    model_display_name: context.model.display_name,
    model_permaslug: context.model.model_id,
    model_or_created_at: '2026-09-01T00:00:00.000Z',
    input_modalities: ['text'],
    output_modalities: ['text'],
    pricing: { discount: 0, meters: { prompt: '0.000001' } },
    metadata: {},
  }
  const field = { provider: 'headquarters', model: 'description', endpoint: 'is_disabled' }[kind]
  const [change] =
    type === 'UPDATE'
      ? compare(
          { [id]: { metadata: { [field]: kind === 'endpoint' ? false : 'Old' } } },
          { [id]: { metadata: { [field]: kind === 'endpoint' ? true : 'New' } } },
        )
      : compare(
          type === 'REMOVE' ? { [id]: snapshot } : {},
          type === 'ADD' ? { [id]: snapshot } : {},
        )
  const fields = { entity_id: id, type, scan_at, change_json: JSON.stringify(change) }
  const event: EventRow =
    kind === 'endpoint'
      ? { ...fields, entity_kind: kind, context }
      : kind === 'model'
        ? { ...fields, entity_kind: kind, context: { model: context.model } }
        : { ...fields, entity_kind: kind, context: { provider: context.provider } }

  return { previous, row: { table: EVENTS_TABLE, value: event } } as const
}

/** Store sources with their prior state and a forward pair, then render them in the given order. */
async function renderStored(sources: ReturnType<typeof lifecycleSource>[]) {
  const t = setup()

  return await t.run(async (ctx) => {
    for (const scan_at of new Set(sources.map(({ row }) => row.value.scan_at))) {
      await ctx.db.insert(INGESTION_RECORDS_TABLE, {
        kind: 'pair',
        from_scan_at: PREVIOUS_SCAN_AT,
        scan_at,
        alerts: true,
        state: 'complete',
      })
    }

    const labels = new Map<string, string>()
    const rows: AlertSource[] = []

    for (const { previous, row } of sources) {
      for (const observation of previous) {
        await ctx.db.insert(OBSERVATIONS_TABLE, observation)
      }

      const id =
        row.table === EVENTS_TABLE
          ? await ctx.db.insert(EVENTS_TABLE, row.value)
          : await ctx.db.insert(OBSERVATIONS_TABLE, row.value)
      const doc = await ctx.db.get(id)
      ok(doc !== null)
      labels.set(id, row.value.entity_id)
      rows.push(doc)
    }

    const rendered = await renderRows(ctx, rows)
    const reversed = await renderRows(ctx, rows.toReversed())

    return {
      rendered,
      reversed,
      order: rendered.messages.map(({ source_ids }) => source_ids.map((id) => labels.get(id))),
    }
  })
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
  // convex-test installs accessors on globals, which spyOn cannot wrap.
  const originalFetch = globalThis.fetch
  const request = jest.fn(async () => {
    throw new Error('Rendering must never contact Discord')
  })
  globalThis.fetch = Object.assign(request, { preconnect: originalFetch.preconnect })
  try {
    await withOrigins(async () => {
      const rendered = await renderRows(ctx, rows)
      expect(rendered.messages).toHaveLength(2)
      expect(rendered.skippedEvents).toEqual([{ source_id: 'hidden', reason: 'ineligible' }])
      const reversed = await renderRows(ctx, rows.toReversed())
      expect(reversed).toEqual(rendered)
    })
    expect(request).not.toHaveBeenCalled()
  } finally {
    globalThis.fetch = originalFetch
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
  const sources = (['endpoint', 'model', 'provider'] as const).flatMap((kind) =>
    (['REMOVE', 'UPDATE', 'ADD'] as const).map((type) => lifecycleSource(kind, type)),
  )

  await withOrigins(async () => {
    const { rendered, reversed, order } = await renderStored(sources)

    expect(rendered.skippedEvents).toEqual([])
    expect(order).toEqual([
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
    expect(reversed).toEqual(rendered)
  })
})

test('individual and batched endpoint unlistings precede last-endpoint departures', async () => {
  await withOrigins(async () => {
    for (const count of [1, 3]) {
      const unlistings = Array.from({ length: count }, (_, i) => `endpoint-${i}`)
      const { rendered, order } = await renderStored([
        lifecycleSource('provider', 'REMOVE'),
        lifecycleSource('endpoint', 'UPDATE', 'unrelated-update'),
        ...unlistings.toReversed().map((id) => lifecycleSource('endpoint', 'REMOVE', id)),
        lifecycleSource('model', 'REMOVE'),
      ])

      expect(order).toEqual([
        ['unrelated-update'],
        unlistings,
        ['model-REMOVE'],
        ['provider-REMOVE'],
      ])
      expect(rendered.messages.at(-1)?.payload).toContain('has no more listed endpoints')
    }
  })
})

test('scan chronology takes precedence over lifecycle order', async () => {
  const later = '2026-09-30T02:00:00.000Z'

  await withOrigins(async () => {
    const { order } = await renderStored([
      lifecycleSource('endpoint', 'ADD', 'endpoint-ADD', later),
      lifecycleSource('provider', 'REMOVE'),
    ])

    expect(order).toEqual([['provider-REMOVE'], ['endpoint-ADD']])
  })
})

test('identical legitimate notification bodies retain distinct deterministic keys inside a group', async () => {
  const event = changed('same-endpoint')
  const rows = [
    { ...event, _id: 'first' as Id<'catalog_events'> },
    { ...event, _id: 'second' as Id<'catalog_events'> },
  ]
  await withOrigins(async () => {
    const rendered = await renderRows({} as QueryCtx, rows)
    expect(rendered.messages).toHaveLength(2)
    expect(rendered.messages[0]?.payload).toBe(rendered.messages[1]?.payload)
    expect(rendered.messages[1]?.key).toBe(`${rendered.messages[0]?.key}:2`)
    expect(await renderRows({} as QueryCtx, rows.toReversed())).toEqual(rendered)
  })
})
