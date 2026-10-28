import { ok } from 'node:assert/strict'

/* oxlint-disable typescript/no-unsafe-type-assertion -- Rendering fixtures provide only the read context used by these events. */
import { expect, vi, test } from 'vitest'

import type { Doc, Id } from '#generated/dataModel'
import type { QueryCtx } from '#generated/server'

import type { EventRow } from '../../catalog/tables/events'
import { EVENTS_TABLE } from '../../catalog/tables/events'
import { OBSERVATIONS_TABLE } from '../../catalog/tables/observations'
import type { ObservationRow } from '../../catalog/tables/observations'
import { compare } from '../../compare'
import { testDouble } from '../../doubles.testing'
import { setup } from '../../harness.testing'
import { INGESTION_RECORDS_TABLE } from '../../ingestion/tables'
import type { JsonValue } from '../../json'
import type { AlertSource } from '../shared/alerts/read'
import { muteNoise } from './mute'
import { canonicalJson, contentKey, renderRows } from './render'

function eventRow(id: string, before: JsonValue, after: JsonValue): Doc<'catalog_events'> {
  const [change] = compare({ [id]: before }, { [id]: after })

  return {
    _creationTime: 0,
    _id: id as Id<'catalog_events'>,
    change_json: JSON.stringify(change),
    context: {
      endpoint: {
        endpoint_id: id,
        provider_display_name: 'Regional offering',
        provider_tag: 'provider/fp8',
      },
      model: { display_name: 'Model', model_id: 'author/model' },
      provider: { display_name: 'Provider', provider_id: 'provider' },
    },
    entity_id: id,
    entity_kind: 'endpoint',
    scan_at: '2026-09-30T01:00:00.000Z',
    type: 'UPDATE',
  }
}

const changed = (id: string) =>
  eventRow(id, { metadata: { is_disabled: false } }, { metadata: { is_disabled: true } })

const SCAN_AT = '2026-09-30T01:00:00.000Z'
const PREVIOUS_SCAN_AT = '2026-09-30T00:00:00.000Z'

type Kind = EventRow['entity_kind']

type Operation = EventRow['type']

/** Endpoint lifecycle and every update are Events; parent lifecycle is an endpoint-count observation. */
function lifecycleSource(
  kind: Kind,
  type: Operation,
  id = `${kind}-${type}`,
  scan_at = SCAN_AT,
  model_id = 'author/model',
) {
  const context = {
    endpoint: {
      endpoint_id: id,
      provider_display_name: 'Tenstorrent',
      provider_tag: 'tenstorrent/fp8',
    },
    model: { display_name: 'Model', model_id: kind === 'model' ? id : model_id },
    provider: {
      display_name: 'Tenstorrent',
      provider_id: kind === 'provider' ? id : 'tenstorrent',
    },
  }

  // A parent update alerts only while the parent keeps serving.
  const previous: ObservationRow[] =
    kind === 'endpoint' || type === 'ADD'
      ? []
      : [
          {
            endpoint_count: 1,
            entity_id: id,
            entity_kind: kind,
            previous_endpoint_count: null,
            scan_at: PREVIOUS_SCAN_AT,
          },
        ]

  if (kind !== 'endpoint' && type !== 'UPDATE') {
    const observation: ObservationRow = {
      endpoint_count: type === 'ADD' ? 1 : 0,
      entity_id: id,
      entity_kind: kind,
      previous_endpoint_count: type === 'ADD' ? 0 : 1,
      scan_at,
    }

    return { previous, row: { table: OBSERVATIONS_TABLE, value: observation } } as const
  }

  const snapshot = {
    ...context.endpoint,
    input_modalities: ['text'],
    metadata: {},
    model_display_name: context.model.display_name,
    model_id: context.model.model_id,
    model_or_created_at: '2026-09-01T00:00:00.000Z',
    model_permaslug: context.model.model_id,
    output_modalities: ['text'],
    pricing: { discount: 0, meters: { prompt: '0.000001' } },
    provider_id: context.provider.provider_id,
    variant: 'standard',
  }

  const field = { endpoint: 'is_disabled', model: 'description', provider: 'headquarters' }[kind]

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

  const fields = { change_json: JSON.stringify(change), entity_id: id, scan_at, type }
  let event: EventRow = { ...fields, context, entity_kind: 'endpoint' }

  if (kind === 'model') {
    event = { ...fields, context: { model: context.model }, entity_kind: kind }
  } else if (kind === 'provider') {
    event = { ...fields, context: { provider: context.provider }, entity_kind: kind }
  }

  return { previous, row: { table: EVENTS_TABLE, value: event } } as const
}

/** Store sources with their prior state and a forward pair, then render them in the given order. */
async function renderStored(sources: ReturnType<typeof lifecycleSource>[], mute = muteNoise) {
  const t = setup()

  return await t.run(async (ctx) => {
    for (const scan_at of new Set(sources.map(({ row }) => row.value.scan_at))) {
      await ctx.db.insert(INGESTION_RECORDS_TABLE, {
        alerts: true,
        from_scan_at: PREVIOUS_SCAN_AT,
        kind: 'pair',
        scan_at,
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

    const rendered = await renderRows(ctx, rows, mute)
    const reversed = await renderRows(ctx, rows.toReversed(), mute)
    const label = (id: string) => labels.get(id)

    return {
      muted: rendered.skippedEvents.flatMap(({ reason, source_id }) =>
        reason === 'muted' ? [label(source_id)] : [],
      ),
      order: rendered.messages.map(({ source_ids }) => source_ids.map(label)),
      rendered,
      reversed,
    }
  })
}

async function withOrigins(run: () => Promise<void>) {
  const before = { logo: process.env.ORCA_LOGO_ORIGIN, web: process.env.ORCA_WEB_ORIGIN }
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

  const hidden = eventRow(
    'hidden',
    { pricing: { meters: { prompt: '1' } } },
    { pricing: { meters: { prompt: '1.001' } } },
  )

  const rows = [...visible, hidden]

  const ctx = testDouble<QueryCtx>({
    db: { get: async (_table: string, id: string) => rows.find((item) => item._id === id) ?? null },
  })

  // convex-test installs accessors on globals, which spyOn cannot wrap.
  const request = vi.fn(async () => {
    throw new Error('Rendering must never contact Discord')
  })

  vi.stubGlobal('fetch', request)

  try {
    await withOrigins(async () => {
      const rendered = await renderRows(ctx, rows)
      expect(rendered.messages).toHaveLength(2)
      expect(rendered.skippedEvents).toEqual([{ reason: 'ineligible', source_id: 'hidden' }])
      const reversed = await renderRows(ctx, rows.toReversed())
      expect(reversed).toEqual(rendered)
    })
    expect(request).not.toHaveBeenCalled()
  } finally {
    vi.unstubAllGlobals()
  }
})

test('content identities canonicalize objects but preserve message and array order', () => {
  // oxlint-disable sort-keys -- Unsorted inputs prove canonicalization ignores key order.
  expect(contentKey({ b: 2, a: { d: 4, c: 3 } })).toBe(contentKey({ a: { c: 3, d: 4 }, b: 2 }))
  expect(contentKey([1, 2])).not.toBe(contentKey([2, 1]))
  expect(canonicalJson({ embeds: [{ title: 'hello' }], content: 'header' })).toBe(
    '{"content":"header","embeds":[{"title":"hello"}]}',
  )
  // oxlint-enable sort-keys
})

/** Disables the temporary Discord filter to exercise the alerts it hides. */
const unmuted: typeof muteNoise = (rows) => ({ muted: [], rows })

/** Each model with its endpoints, across every lifecycle operation, plus provider bookends. */
const modelGroups = () => [
  lifecycleSource('provider', 'REMOVE'),
  lifecycleSource('endpoint', 'REMOVE', 'gone-endpoint', SCAN_AT, 'c/gone'),
  lifecycleSource('model', 'REMOVE', 'c/gone'),
  lifecycleSource('endpoint', 'ADD', 'new-endpoint', SCAN_AT, 'b/new'),
  lifecycleSource('model', 'ADD', 'b/new'),
  lifecycleSource('endpoint', 'UPDATE', 'old-endpoint', SCAN_AT, 'a/old'),
  lifecycleSource('model', 'UPDATE', 'a/old'),
  lifecycleSource('provider', 'UPDATE'),
  lifecycleSource('provider', 'ADD'),
]

test('Discord groups each model with its endpoints in dependency order regardless of input order', async () => {
  await withOrigins(async () => {
    const { rendered, reversed, order } = await renderStored(modelGroups(), unmuted)

    expect(rendered.skippedEvents).toEqual([])
    expect(order).toEqual([
      ['provider-ADD'],
      ['provider-UPDATE'],
      ['a/old'],
      ['old-endpoint'],
      ['b/new'],
      ['new-endpoint'],
      ['gone-endpoint'],
      ['c/gone'],
      ['provider-REMOVE'],
    ])
    expect(reversed).toEqual(rendered)
  })
})

test('temporarily muted endpoint unlistings leave the remaining model order intact', async () => {
  await withOrigins(async () => {
    const { muted, order } = await renderStored(modelGroups())

    expect(muted).toEqual(['gone-endpoint'])
    expect(order).toEqual([
      ['provider-ADD'],
      ['provider-UPDATE'],
      ['a/old'],
      ['old-endpoint'],
      ['b/new'],
      ['new-endpoint'],
      ['c/gone'],
      ['provider-REMOVE'],
    ])
  })
})

test('variants sort beside their standard model, and a duplicate batch model card is muted', async () => {
  const terra = 'openai/gpt-6.1-terra'

  await withOrigins(async () => {
    const { muted, order } = await renderStored([
      lifecycleSource('endpoint', 'ADD', 'batch-endpoint', SCAN_AT, `${terra}:batch`),
      lifecycleSource('model', 'ADD', `${terra}:batch`),
      lifecycleSource('endpoint', 'ADD', 'mini-endpoint', SCAN_AT, `${terra}-mini`),
      lifecycleSource('model', 'ADD', `${terra}-mini`),
      lifecycleSource('endpoint', 'ADD', 'standard-endpoint', SCAN_AT, terra),
      lifecycleSource('model', 'ADD', terra),
    ])

    expect(muted).toEqual([`${terra}:batch`])
    expect(order).toEqual([
      [terra],
      ['standard-endpoint'],
      ['batch-endpoint'],
      [`${terra}-mini`],
      ['mini-endpoint'],
    ])
  })
})

test('individual and batched endpoint unlistings precede last-endpoint departures', async () => {
  await withOrigins(async () => {
    for (const count of [1, 3]) {
      const unlistings = Array.from({ length: count }, (_, i) => `endpoint-${i}`)

      const { rendered, order } = await renderStored(
        [
          lifecycleSource('provider', 'REMOVE'),
          lifecycleSource('endpoint', 'UPDATE', 'unrelated-update'),
          ...unlistings.toReversed().map((id) => lifecycleSource('endpoint', 'REMOVE', id)),
          lifecycleSource('model', 'REMOVE'),
        ],
        unmuted,
      )

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
