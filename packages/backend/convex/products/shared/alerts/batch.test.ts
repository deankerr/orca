import { deepEqual } from 'node:assert/strict'

import type { PaginationResult } from 'convex/server'
import { expect, vi, test } from 'vitest'

import type { EventRow } from '../../../catalog/tables/events'
import { compare } from '../../../compare'
import type { JsonValue } from '../../../json'
import { prepareBatch as prepareDiscordBatch } from '../../discord/prepare'
import { batchCards } from '../../discord/renderers/batchCards'
import { renderDiscordBatch } from '../../discord/renderers/index'
import { renderPage as renderAlertsPage } from '../../feed/render'
import { batchAlerts } from './batch'
import type { Alert, IndividualAlert } from './batch'
import type { AlertChange, EntityAlert } from './curate'
import { prepare as prepareAlert } from './prepare'

const shared: AlertChange = {
  added: [],
  field: 'supported_parameters',
  kind: 'list',
  removed: ['audio', 'image'],
}

const unique: AlertChange = {
  after: 131_072,
  before: 943_718,
  field: 'max_completion_tokens',
  kind: 'count',
}

function bucket(index: number, changes: AlertChange[] = [shared]): IndividualAlert {
  const entity_id = `abcdef${index}-endpoint`

  return {
    event: {
      changes,
      context: {
        endpoint: {
          endpoint_id: entity_id,
          provider_display_name: 'Provider',
          provider_tag: 'provider/fp8',
        },
        model: { display_name: 'Model', model_id: `author/model-${index}` },
        provider: { display_name: 'Provider', provider_id: 'provider' },
      },
      entity_id,
      entity_kind: 'endpoint',
      observed_at: '2026-10-01T17:40:05.451Z',
      type: 'endpoint_updated',
    },
    source_id: `event-${index}`,
    type: 'event',
  }
}

function occurrences(buckets: Alert[]): number {
  return buckets.reduce<number>((count, item) => count + occurrenceCount(item), 0)
}

function occurrenceCount(item: Alert): number {
  if (item.type === 'batch') {
    return item.members.length
  }

  return 'changes' in item.event ? item.event.changes.length : 0
}

test('extracts each shared item independently, keeps unique fields, and drops only empty updates', () => {
  const second: AlertChange = { after: false, before: null, field: 'is_disabled', kind: 'flag' }

  const input = Array.from({ length: 5 }, (_, i) =>
    bucket(i, [
      { ...shared, removed: i % 2 === 0 ? ['image', 'audio'] : ['audio', 'image'] },
      second,
      ...(i === 0 ? [unique] : []),
    ]),
  )

  const before = JSON.stringify(input)
  const result = batchAlerts(input)

  expect(result.map((item) => item.type)).toEqual(['batch', 'batch', 'event'])
  expect(result[2]).toEqual(bucket(0, [unique]))
  expect(occurrences(result)).toBe(11)
  expect(JSON.stringify(input)).toBe(before)
  expect(batchAlerts(input.slice(0, 2))).toEqual(input.slice(0, 2))
  expect(batchAlerts(input.slice(0, 3)).map((item) => item.type)).toEqual([
    'batch',
    'batch',
    'event',
  ])
  expect(batchAlerts(Array.from({ length: 5 }, () => bucket(0)))).toHaveLength(5)
})

test('batches five endpoint unlistings at one observation and renders their provider group', () => {
  const endpoints = [
    ['deepseek/deepseek-v4-flash-0731', '78a678'],
    ['deepseek/deepseek-v4-pro', '6c7fe4'],
    ['deepseek/deepseek-v4-pro-0813', 'ca5f0f'],
    ['deepseek/deepseek-v4.1-flash', '054ac2'],
    ['z-ai/glm-5.3-flash', '6b1894'],
  ] as const

  const members = endpoints.map(([model_id, prefix], index): IndividualAlert => {
    const { event, ...member } = bucket(index)

    if (event.entity_kind !== 'endpoint') {
      throw new Error('Expected endpoint fixture')
    }

    return {
      ...member,
      event: {
        before: [],
        context: {
          endpoint: {
            ...event.context.endpoint,
            endpoint_id: `${prefix}-endpoint`,
            provider_tag: 'nextbit/fp8',
          },
          model: { display_name: model_id, model_id },
          provider: { display_name: 'NextBit', provider_id: 'nextbit' },
        },
        entity_id: `${prefix}-endpoint`,
        entity_kind: 'endpoint',
        observed_at: event.observed_at,
        type: 'endpoint_removed',
      },
    }
  })

  const result = batchAlerts(members)
  const cards = renderDiscordBatch(result, urls)
  const embed = cards[0]?.message.embeds?.[0]

  expect(result).toEqual([{ change: { kind: 'endpoint_removed' }, members, type: 'batch' }])
  expect(cards).toHaveLength(1)
  expect(cards[0]?.source_ids.toSorted()).toEqual(
    members.map((member) => member.source_id).toSorted(),
  )
  expect(embed?.title).toBeUndefined()
  expect(embed?.author?.name).toBe('nextbit')
  expect(embed?.author?.url).toBe('https://orca.orb.town/?q=nextbit')
  expect(embed?.author?.icon_url).toContain('nextbit')
  expect(embed?.color).toBe(0xef_44_44)
  expect(embed?.description?.startsWith('Provider **NextBit** unlisted 5 endpoints.\n\n')).toBe(
    true,
  )
  expect(embed?.description).not.toContain('(nextbit)')
  expect(embed?.description).not.toContain('nextbit/fp8')

  for (const [model_id, prefix] of endpoints) {
    expect(embed?.description?.split('\n')).toContain(`- ${model_id} (${prefix})`)
  }

  const paged = batchCards(
    {
      change: { kind: 'endpoint_removed' },
      members: Array.from({ length: 9 }, (_, round) =>
        members.map((member, offset) => ({ ...member, source_id: `page-${round * 5 + offset}` })),
      ).flat(),
      type: 'batch',
    },
    urls,
  )

  expect(paged.map((card) => card.source_ids.length)).toEqual([40, 5])

  for (const [index, card] of paged.entries()) {
    expect(card.message.embeds?.[0]?.author).toEqual(embed?.author)
    expect(card.message.embeds?.[0]?.footer?.text).toBe(`${index + 1}/2`)
    expect(card.message.embeds?.[0]?.description).toContain('unlisted 45 endpoints.')
  }

  const mixed = structuredClone(members)
  const [moved] = mixed

  if (moved?.event.entity_kind === 'endpoint') {
    moved.event.context.provider.provider_id = 'another-provider'
  }

  const mixedEmbed = renderDiscordBatch(batchAlerts(mixed), urls)[0]?.message.embeds?.[0]

  expect(mixedEmbed?.author).toBeUndefined()
  expect(mixedEmbed?.title).toBe('5 endpoints unlisted')

  expect(batchAlerts(members.slice(0, 2))).toEqual(members.slice(0, 2))
  expect(batchAlerts(members.slice(0, 3))).toEqual([
    { change: { kind: 'endpoint_removed' }, members: members.slice(0, 3), type: 'batch' },
  ])
  const [first] = members

  if (first === undefined) {
    throw new Error('Expected an unlisting')
  }

  expect(batchAlerts(Array.from({ length: 5 }, () => first))).toHaveLength(5)

  const otherScan = members.slice(0, 3).map((member, index) => ({
    ...member,
    event: {
      ...member.event,
      observed_at: index === 0 ? '2026-10-01T18:40:00Z' : member.event.observed_at,
    },
  }))

  expect(batchAlerts(otherScan)).toEqual(otherScan)

  for (const entity_kind of ['model', 'provider'] as const) {
    const departures: IndividualAlert[] = members.map((member, index) => ({
      ...member,
      event: {
        before: [],
        entity_id: `${entity_kind}-${index}`,
        observed_at: member.event.observed_at,
        ...(entity_kind === 'model'
          ? {
              context: { model: { display_name: 'Model', model_id: `model-${index}` } },
              entity_kind,
              type: 'model_removed',
            }
          : {
              context: { provider: { display_name: 'Provider', provider_id: `provider-${index}` } },
              entity_kind,
              type: 'provider_removed',
            }),
      },
    }))

    expect(batchAlerts(departures)).toEqual(departures)
  }
})

test('keeps scans, kinds, operations, values, and lifecycle events separate', () => {
  const input = Array.from({ length: 2 }, (_, i) => bucket(i))
  const base = bucket(4)

  const otherScan: IndividualAlert = {
    ...base,
    event: { ...base.event, observed_at: '2026-10-01T18:40:00Z' },
  }

  const provider: IndividualAlert = {
    ...base,
    event: {
      changes: [shared],
      context: { provider: { display_name: 'Provider', provider_id: 'provider' } },
      entity_id: 'provider',
      entity_kind: 'provider',
      observed_at: base.event.observed_at,
      type: 'provider_updated',
    },
  }

  const arrival: IndividualAlert = {
    ...provider,
    event: {
      after: [],
      context: { provider: { display_name: 'New', provider_id: 'new-provider' } },
      entity_id: 'new-provider',
      entity_kind: 'provider',
      observed_at: base.event.observed_at,
      type: 'provider_added',
    },
  }

  const all = [
    ...input,
    otherScan,
    provider,
    arrival,
    bucket(5, [{ ...shared, removed: ['image'] }]),
  ]

  expect(batchAlerts(all)).toEqual(all)

  const numeric = Array.from({ length: 2 }, (_, i) =>
    bucket(i, [{ after: 2, before: 1, field: 'context_length', kind: 'count' }]),
  )

  const distinct: AlertChange[] = [
    { after: 3, before: 1, field: 'context_length', kind: 'count' },
    { after: 2, before: null, field: 'context_length', kind: 'count' },
    { after: 2, before: 1, field: 'limit_rpm', kind: 'count' },
  ]

  expect(
    batchAlerts([...numeric, ...distinct.map((change, i) => bucket(i + 4, [change]))]),
  ).toHaveLength(5)
})

test('a remainder keeps its original event eligibility when its shared change is batched', async () => {
  const rows = Array.from({ length: 5 }, (_, i) =>
    stored(
      i,
      { pricing: { meters: { completion: '1', prompt: '1' } } },
      { pricing: { meters: { completion: i === 0 ? '1.5' : '1', prompt: '2' } } },
    ),
  )

  const { alerts, skipped } = await prepareBatch(rows)
  const notifications = renderDiscordBatch(alerts, urls)

  expect(skipped).toBe(0)
  expect(notifications).toHaveLength(2)
  expect(notifications[0]?.source_ids).toHaveLength(5)
  expect(notifications[1]?.source_ids).toEqual(['event-0'])
  expect(JSON.stringify(notifications[1]?.message)).toContain('**Output**')
})

test('batch cards identify all three entity types and page long lists without losing identities', () => {
  const model: EntityAlert = {
    changes: [],
    context: { model: { display_name: 'Model', model_id: 'author/model' } },
    entity_id: 'author/model',
    entity_kind: 'model',
    observed_at: '2026-10-01T17:40:05.451Z',
    type: 'model_updated',
  }

  const provider: EntityAlert = {
    changes: [],
    context: { provider: { display_name: 'Provider', provider_id: 'provider' } },
    entity_id: 'provider',
    entity_kind: 'provider',
    observed_at: model.observed_at,
    type: 'provider_updated',
  }

  const cases: [EntityAlert, AlertChange, string[]][] = [
    [model, { ...shared, field: 'input_modalities' }, ['author/model', 'image', 'audio']],
    [
      provider,
      {
        after: 'https://example.com/legal/privacy',
        before: 'https://example.com/privacy',
        field: 'privacy_policy_url',
        kind: 'text',
      },
      ['- Provider (provider)', 'privacy_policy_url', 'https://example.com/legal/privacy'],
    ],
    [
      bucket(0).event,
      unique,
      ['author/model-0', 'provider', 'abcdef', 'max_output', '943,718', '131,072'],
    ],
    [
      bucket(0).event,
      { after: 7, before: 30, field: 'data_policy.retention_days', kind: 'count' },
      ['retention_days', '30 days', '7 days'],
    ],
  ]

  for (const [event, change, expected] of cases) {
    const cards = batchCards(
      {
        change,
        members: [{ event, source_id: 'source', type: 'event' }],
        type: 'batch',
      },
      urls,
    )

    const text = JSON.stringify(cards)

    for (const part of expected) {
      expect(text).toContain(part)
    }
  }

  const members = Array.from({ length: 100 }, (_, i) => bucket(i))
  const cards = batchCards({ change: shared, members, type: 'batch' }, urls)

  expect(cards.length).toBeGreaterThan(1)
  expect(cards.flatMap((card) => card.source_ids).toSorted()).toEqual(
    members.map((member) => member.source_id).toSorted(),
  )

  for (const { message, source_ids } of cards) {
    expect(message.embeds?.[0]?.description?.length).toBeLessThanOrEqual(4000)
    expect(message.embeds?.[0]?.description).toContain('**Provider** (provider)\n')
    expect(source_ids.length).toBeLessThanOrEqual(40)
    expect(message.allowed_mentions).toEqual({ parse: [] })
  }
})

test('endpoint batch cards group by the smaller dimension and keep each identity on one line', () => {
  for (const [providerCount, modelCount] of [
    [1, 6],
    [6, 1],
    [2, 3],
    [3, 2],
    [2, 2],
  ] satisfies [number, number][]) {
    const members = Array.from({ length: 6 }, (_, index) => {
      const member = bucket(index)

      if (member.event.entity_kind === 'endpoint') {
        member.event.entity_id = `00000${index}-endpoint`
        member.event.context.model.model_id = `author/model-${index % modelCount}`
        member.event.context.provider.provider_id = `provider-${index % providerCount}`
        member.event.context.endpoint.provider_tag = `route-${index}/flex`
      }

      return member
    })

    const cards = batchCards({ change: shared, members, type: 'batch' }, urls)
    const description = cards[0]?.message.embeds?.[0]?.description ?? ''
    const groupByModel = modelCount < providerCount

    expect(cards).toHaveLength(1)
    expect(cards[0]?.source_ids.toSorted()).toEqual(
      members.map((member) => member.source_id).toSorted(),
    )
    expect(description.match(/^\*\*/gmu)).toHaveLength(Math.min(providerCount, modelCount))

    for (let index = 0; index < 6; index += 1) {
      const group = groupByModel
        ? `author/model-${index % modelCount}`
        : `provider-${index % providerCount}`

      const label = groupByModel ? `route-${index}/flex` : `author/model-${index % modelCount}`

      expect(description).toContain(groupByModel ? `**${group}**\n` : `**Provider** (${group})\n`)
      expect(description.split('\n')).toContain(`- ${label} (00000${index})`)
    }

    if (!groupByModel) {
      expect(description).not.toContain('route-')
    }
  }
})

const urls = { logoOrigin: 'https://logos.orb.town', publicUrl: 'https://orca.orb.town' }

function stored(
  index: number,
  before: JsonValue,
  after: JsonValue,
  kind: 'endpoint' | 'provider' = 'endpoint',
): EventRow & { _id: string } {
  const entity_id = `entity-${index}`
  const [change] = compare({ [entity_id]: before }, { [entity_id]: after })

  const fields = {
    _id: `event-${index}`,
    change_json: JSON.stringify(change),
    entity_id,
    scan_at: '2026-10-01T17:40:05.451Z',
    type: 'UPDATE' as const,
  }

  const provider = { display_name: 'Provider', provider_id: `provider-${index}` }

  return kind === 'provider'
    ? { ...fields, context: { provider }, entity_kind: 'provider' }
    : {
        ...fields,
        context: {
          endpoint: {
            endpoint_id: entity_id,
            provider_display_name: 'Provider',
            provider_tag: 'provider/fp8',
          },
          model: { display_name: 'Model', model_id: `author/model-${index}` },
          provider,
        },
        entity_kind: 'endpoint',
      }
}

test('provider URL batches pass shared selection and retain individual changes', async () => {
  const rows = Array.from({ length: 5 }, (_, i) =>
    stored(
      i,
      {
        // oxlint-disable sort-keys -- Fixture key order sets the order of the compared change paths.
        metadata: {
          headquarters: 'US',
          dataPolicy: { privacyPolicyURL: 'https://example.com/privacy' },
        },
      },
      {
        metadata: {
          headquarters: i === 0 ? 'GB' : 'US',
          dataPolicy: { privacyPolicyURL: 'https://example.com/legal/privacy', training: false },
        },
      },
      // oxlint-enable sort-keys
      'provider',
    ),
  )

  const { alerts, skipped } = await prepareBatch(rows)
  const notifications = renderDiscordBatch(alerts, urls)
  const [batch, remainder] = notifications

  expect(skipped).toBe(0)
  expect(notifications).toHaveLength(2)
  expect(batch?.source_ids).toEqual(rows.map((row) => row._id))
  expect(JSON.stringify(batch?.message)).toContain('privacy_policy_url')
  expect(JSON.stringify(batch?.message)).toContain('https://example.com/legal/privacy')
  expect(remainder?.source_ids).toEqual(['event-0'])
  expect(JSON.stringify(remainder?.message)).toContain('headquarters')
  expect(JSON.stringify(remainder?.message)).not.toContain('privacy_policy_url')
  expect(JSON.stringify(notifications)).not.toContain('training')

  // Monitor and Feed share selected content and retain individual events.
  const monitor = rows.map(prepareAlert)
  const feed = renderPage({ continueCursor: '', isDone: true, page: rows }).page

  expect(monitor).toHaveLength(5)
  expect(monitor.every((alert) => alert?.type === 'provider_updated')).toBe(true)
  const [first] = monitor

  expect(
    first?.type === 'provider_updated' ? first.changes.map((change) => change.field) : [],
  ).toEqual(['headquarters', 'privacy_policy_url'])
  expect(JSON.stringify(monitor)).not.toContain('training')
  expect(feed.every((alert) => alert?.type === 'provider_updated')).toBe(true)
  expect(JSON.stringify(feed)).not.toContain('training')
  deepEqual(
    feed.map(({ summary: _summary, details: _details, ...event }) => event),
    monitor,
  )
})

test('oversized batch details and identity fields truncate without losing members or UUID prefixes', () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

  try {
    const members = Array.from({ length: 50 }, (_, index) => {
      const member = bucket(index)

      if (member.event.entity_kind === 'endpoint') {
        member.event.context.model.model_id = 'm'.repeat(5000)
        member.event.context.endpoint.provider_tag = 'p'.repeat(5000)
      }

      return member
    })

    const cards = batchCards(
      {
        change: {
          ...shared,
          removed: Array.from({ length: 200 }, (_, i) => `parameter-${i}-${'x'.repeat(20)}`),
        },
        members,
        type: 'batch',
      },
      urls,
    )

    expect(cards.flatMap((card) => card.source_ids).toSorted()).toEqual(
      members.map((member) => member.source_id).toSorted(),
    )

    for (const { message, source_ids } of cards) {
      expect(message.embeds?.[0]?.description?.length).toBeLessThanOrEqual(4000)
      expect(message.embeds?.[0]?.description).toContain('abcdef')
      expect(source_ids.length).toBeGreaterThan(0)
      expect(source_ids.length).toBeLessThanOrEqual(40)
    }

    expect(errors).toHaveBeenCalled()
    expect(JSON.stringify(errors.mock.calls)).toContain('batch.supported_parameters')
  } finally {
    errors.mockRestore()
  }
})

async function prepareBatch(rows: (EventRow & { _id: string })[]) {
  return await prepareDiscordBatch(
    rows.map((row) => ({ event: prepareAlert(row), source_id: row._id })),
    async (candidates) => candidates.map(() => false),
  )
}

function renderPage(result: PaginationResult<EventRow>) {
  return renderAlertsPage({
    ...result,
    page: result.page.flatMap((row) => {
      const alert = prepareAlert(row)

      return alert === null ? [] : [alert]
    }),
  })
}
