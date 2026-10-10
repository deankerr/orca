import { expect, spyOn, test } from 'bun:test'
import { deepEqual } from 'node:assert/strict'

import { compare } from '../../compare'
import type { EventRow } from '../../events/table'
import type { JsonValue } from '../../json'
import { prepareBatch as prepareDiscordBatch } from '../discord/prepare'
import { batchCards } from '../discord/renderers/batchCards'
import { renderDiscordBatch } from '../discord/renderers/index'
import { renderPage } from '../feed/query'
import { batchAlerts } from './batch'
import type { Alert, IndividualAlert } from './batch'
import type { EntityAlert, FieldChange } from './curate'
import { prepare as prepareAlert } from './prepare'

const shared: FieldChange = {
  type: 'set_updated',
  path: 'supported_parameters',
  added: [],
  removed: ['audio', 'image'],
}
const unique: FieldChange = {
  type: 'field_updated',
  path: 'max_completion_tokens',
  before: 943_718,
  after: 131_072,
}

function bucket(index: number, changes: FieldChange[] = [shared]): IndividualAlert {
  const entity_id = `abcdef${index}-endpoint`

  return {
    type: 'event',
    event_id: `event-${index}`,
    event: {
      type: 'endpoint_updated',
      entity_kind: 'endpoint',
      entity_id,
      observed_at: '2026-10-01T17:40:05.451Z',
      changes,
      context: {
        model: { model_id: `author/model-${index}`, display_name: 'Model' },
        provider: { provider_id: 'provider', display_name: 'Provider' },
        endpoint: {
          endpoint_id: entity_id,
          provider_tag: 'provider/fp8',
          provider_display_name: 'Provider',
        },
      },
    },
  }
}

function occurrences(buckets: Alert[]): number {
  return buckets.reduce<number>(
    (count, item) =>
      count +
      (item.type === 'batch'
        ? item.members.length
        : 'changes' in item.event
          ? item.event.changes.length
          : 0),
    0,
  )
}

test('extracts each shared item independently, keeps unique fields, and drops only empty updates', () => {
  const second: FieldChange = { type: 'field_added', path: 'is_disabled', after: false }
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
  ]
  const members = endpoints.map(([model_id, prefix], index): IndividualAlert => {
    const { event, ...member } = bucket(index)

    if (event.entity_kind !== 'endpoint') {
      throw new Error('Expected endpoint fixture')
    }

    return {
      ...member,
      event: {
        type: 'endpoint_removed',
        entity_kind: 'endpoint',
        entity_id: `${prefix}-endpoint`,
        observed_at: event.observed_at,
        before: {},
        context: {
          model: { model_id, display_name: model_id },
          provider: { provider_id: 'nextbit', display_name: 'NextBit' },
          endpoint: {
            ...event.context.endpoint,
            endpoint_id: `${prefix}-endpoint`,
            provider_tag: 'nextbit/fp8',
          },
        },
      },
    }
  })
  const result = batchAlerts(members)
  const cards = renderDiscordBatch(result, urls)
  const embed = cards[0]?.message.embeds?.[0]

  expect(result).toEqual([{ type: 'batch', change: { type: 'endpoint_removed' }, members }])
  expect(cards).toHaveLength(1)
  expect(cards[0]?.event_ids.toSorted()).toEqual(
    members.map((member) => member.event_id).toSorted(),
  )
  expect(embed?.title).toBeUndefined()
  expect(embed?.author?.name).toBe('NextBit • nextbit')
  expect(embed?.author?.url).toBe('https://orca.orb.town/?q=nextbit')
  expect(embed?.author?.icon_url).toContain('nextbit')
  expect(embed?.color).toBe(0xef_44_44)
  expect(embed?.description).toStartWith('− Provider **NextBit** unlisted 5 endpoints.\n\n')
  expect(embed?.description).not.toContain('**`nextbit`**')
  expect(embed?.description).not.toContain('nextbit/fp8')

  for (const [model_id, prefix] of endpoints) {
    expect(embed?.description?.split('\n')).toContain(`\`${model_id}\` • \`${prefix}\``)
  }

  const paged = batchCards(
    {
      type: 'batch',
      change: { type: 'endpoint_removed' },
      members: Array.from({ length: 45 }, (_, index) => ({
        ...members[index % 5],
        event_id: `page-${index}`,
      })),
    },
    urls,
  )

  expect(paged.map((card) => card.event_ids.length)).toEqual([40, 5])

  for (const [index, card] of paged.entries()) {
    expect(card.message.embeds?.[0]?.author).toEqual(embed?.author)
    expect(card.message.embeds?.[0]?.footer?.text).toBe(`${index + 1}/2`)
    expect(card.message.embeds?.[0]?.description).toContain('unlisted 45 endpoints.')
  }

  const mixed = structuredClone(members)

  if (mixed[0].event.entity_kind === 'endpoint') {
    mixed[0].event.context.provider.provider_id = 'another-provider'
  }

  const mixedEmbed = renderDiscordBatch(batchAlerts(mixed), urls)[0]?.message.embeds?.[0]

  expect(mixedEmbed?.author).toBeUndefined()
  expect(mixedEmbed?.title).toBe('5 endpoints unlisted')

  expect(batchAlerts(members.slice(0, 2))).toEqual(members.slice(0, 2))
  expect(batchAlerts(members.slice(0, 3))).toEqual([
    { type: 'batch', change: { type: 'endpoint_removed' }, members: members.slice(0, 3) },
  ])
  expect(batchAlerts(Array.from({ length: 5 }, () => members[0]))).toHaveLength(5)

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
        entity_id: `${entity_kind}-${index}`,
        observed_at: member.event.observed_at,
        before: {},
        ...(entity_kind === 'model'
          ? {
              type: 'model_removed',
              entity_kind,
              context: { model: { model_id: `model-${index}`, display_name: 'Model' } },
            }
          : {
              type: 'provider_removed',
              entity_kind,
              context: { provider: { provider_id: `provider-${index}`, display_name: 'Provider' } },
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
      type: 'provider_updated',
      entity_kind: 'provider',
      entity_id: 'provider',
      observed_at: base.event.observed_at,
      context: { provider: { provider_id: 'provider', display_name: 'Provider' } },
      changes: [shared],
    },
  }
  const arrival: IndividualAlert = {
    ...provider,
    event: {
      type: 'provider_added',
      entity_kind: 'provider',
      entity_id: 'new-provider',
      observed_at: base.event.observed_at,
      context: { provider: { provider_id: 'new-provider', display_name: 'New' } },
      after: {},
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
    bucket(i, [{ type: 'field_updated', path: 'context_length', before: 1, after: 2 }]),
  )
  const distinct: FieldChange[] = [
    { type: 'field_updated', path: 'context_length', before: '1', after: '2' },
    { type: 'field_added', path: 'context_length', after: 2 },
    { type: 'field_updated', path: 'context_length', before: null, after: 2 },
  ]

  expect(
    batchAlerts([...numeric, ...distinct.map((change, i) => bucket(i + 4, [change]))]),
  ).toHaveLength(5)
})

test('normalizes record keys and preserves eligibility when rendering a remainder', async () => {
  const records = Array.from({ length: 5 }, (_, i) =>
    bucket(i, [
      {
        type: 'field_added',
        path: 'data_policy',
        after:
          i % 2 === 0
            ? { training: false, retentionDays: 0 }
            : { retentionDays: 0, training: false },
      },
    ]),
  )

  expect(batchAlerts(records)).toHaveLength(1)

  const rows = Array.from({ length: 5 }, (_, i) =>
    stored(
      i,
      { pricing: { meters: { prompt: '1', completion: '1' } } },
      { pricing: { meters: { prompt: '2', completion: i === 0 ? '1.001' : '1' } } },
    ),
  )
  const { alerts, skipped } = await prepareBatch(rows)
  const notifications = renderDiscordBatch(alerts, urls)

  expect(skipped).toBe(0)
  expect(notifications).toHaveLength(2)
  expect(notifications[0]?.event_ids).toHaveLength(5)
  expect(notifications[1]?.event_ids).toEqual(['event-0'])
  expect(JSON.stringify(notifications[1]?.message)).toContain('output')
})

test('batch cards identify all three entity types and page long lists without losing identities', () => {
  const model: EntityAlert = {
    type: 'model_updated',
    entity_kind: 'model',
    entity_id: 'author/model',
    observed_at: '2026-10-01T17:40:05.451Z',
    context: { model: { model_id: 'author/model', display_name: 'Model' } },
    changes: [],
  }
  const provider: EntityAlert = {
    type: 'provider_updated',
    entity_kind: 'provider',
    entity_id: 'provider',
    observed_at: model.observed_at,
    context: { provider: { provider_id: 'provider', display_name: 'Provider' } },
    changes: [],
  }

  const cases: [EntityAlert, FieldChange, string[]][] = [
    [model, { ...shared, path: 'input_modalities' }, ['author/model', 'image', 'audio']],
    [
      provider,
      {
        type: 'field_updated',
        path: 'dataPolicy.privacyPolicyURL',
        before: 'https://example.com/privacy',
        after: 'https://example.com/legal/privacy',
      },
      ['Provider • `provider`', 'dataPolicy.privacyPolicyURL', 'https://example.com/legal/privacy'],
    ],
    [
      bucket(0).event,
      unique,
      ['author/model-0', 'provider', 'abcdef', 'max_output', '943,718', '131,072'],
    ],
    [
      bucket(0).event,
      { type: 'field_updated', path: 'data_policy.retentionDays', before: 30, after: 7 },
      ['retentionDays', '30 days', '7 days'],
    ],
  ]

  for (const [event, change, expected] of cases) {
    const cards = batchCards(
      {
        type: 'batch',
        change,
        members: [{ type: 'event', event_id: 'source', event }],
      },
      urls,
    )
    const text = JSON.stringify(cards)

    for (const part of expected) {
      expect(text).toContain(part)
    }
  }

  const members = Array.from({ length: 100 }, (_, i) => bucket(i))
  const cards = batchCards({ type: 'batch', change: shared, members }, urls)

  expect(cards.length).toBeGreaterThan(1)
  expect(cards.flatMap((card) => card.event_ids).toSorted()).toEqual(
    members.map((member) => member.event_id).toSorted(),
  )

  for (const { message, event_ids } of cards) {
    expect(message.embeds?.[0]?.description?.length).toBeLessThanOrEqual(4000)
    expect(message.embeds?.[0]?.description).toContain('**Provider** • `provider`\n')
    expect(event_ids.length).toBeLessThanOrEqual(40)
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
  ]) {
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
    const cards = batchCards({ type: 'batch', change: shared, members }, urls)
    const description = cards[0]?.message.embeds?.[0]?.description ?? ''
    const groupByModel = modelCount < providerCount

    expect(cards).toHaveLength(1)
    expect(cards[0]?.event_ids.toSorted()).toEqual(
      members.map((member) => member.event_id).toSorted(),
    )
    expect(description.match(/^\*\*/gm)).toHaveLength(Math.min(providerCount, modelCount))

    for (let index = 0; index < 6; index += 1) {
      const group = groupByModel
        ? `author/model-${index % modelCount}`
        : `provider-${index % providerCount}`
      const label = groupByModel ? `route-${index}/flex` : `author/model-${index % modelCount}`

      expect(description).toContain(
        groupByModel ? `**\`${group}\`**\n` : `**Provider** • \`${group}\`\n`,
      )
      expect(description.split('\n')).toContain(`\`${label}\` • \`00000${index}\``)
    }

    if (!groupByModel) {
      expect(description).not.toContain('route-')
    }
  }
})

const urls = { publicUrl: 'https://orca.orb.town', logoOrigin: 'https://logos.orb.town' }

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
    entity_id,
    type: 'UPDATE' as const,
    scan_at: '2026-10-01T17:40:05.451Z',
    change_json: JSON.stringify(change),
  }
  const provider = { provider_id: `provider-${index}`, display_name: 'Provider' }

  return kind === 'provider'
    ? { ...fields, entity_kind: 'provider', context: { provider } }
    : {
        ...fields,
        entity_kind: 'endpoint',
        context: {
          provider,
          model: { model_id: `author/model-${index}`, display_name: 'Model' },
          endpoint: {
            endpoint_id: entity_id,
            provider_tag: 'provider/fp8',
            provider_display_name: 'Provider',
          },
        },
      }
}

test('provider URL batches pass shared selection and retain individual changes', async () => {
  const rows = Array.from({ length: 5 }, (_, i) =>
    stored(
      i,
      {
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
      'provider',
    ),
  )
  const { alerts, skipped } = await prepareBatch(rows)
  const notifications = renderDiscordBatch(alerts, urls)
  const [batch, remainder] = notifications

  expect(skipped).toBe(0)
  expect(notifications).toHaveLength(2)
  expect(batch?.event_ids).toEqual(rows.map((row) => row._id))
  expect(JSON.stringify(batch?.message)).toContain('dataPolicy.privacyPolicyURL')
  expect(JSON.stringify(batch?.message)).toContain('https://example.com/legal/privacy')
  expect(remainder?.event_ids).toEqual(['event-0'])
  expect(JSON.stringify(remainder?.message)).toContain('headquarters')
  expect(JSON.stringify(remainder?.message)).not.toContain('privacyPolicyURL')
  expect(JSON.stringify(notifications)).not.toContain('training')

  // Monitor and Feed share selected content and retain individual events.
  const monitor = rows.map(prepareAlert)
  const feed = renderPage({ page: rows, isDone: true, continueCursor: '' }).page

  expect(monitor).toHaveLength(5)
  expect(monitor.every((alert) => alert?.type === 'provider_updated')).toBe(true)
  const [first] = monitor

  expect(
    first?.type === 'provider_updated' ? first.changes.map((change) => change.path) : [],
  ).toEqual(['headquarters', 'dataPolicy.privacyPolicyURL'])
  expect(JSON.stringify(monitor)).not.toContain('training')
  expect(feed.every((alert) => alert?.type === 'provider_updated')).toBe(true)
  expect(JSON.stringify(feed)).not.toContain('training')
  deepEqual(
    feed.map(({ summary: _summary, details: _details, ...event }) => event),
    monitor,
  )
})

test('oversized batch details and identity fields truncate without losing members or UUID prefixes', () => {
  const errors = spyOn(console, 'error').mockImplementation(() => {})

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
        type: 'batch',
        change: { ...shared, removed: Array.from({ length: 200 }, (_, i) => `parameter-${i}`) },
        members,
      },
      urls,
    )

    expect(cards.flatMap((card) => card.event_ids).toSorted()).toEqual(
      members.map((member) => member.event_id).toSorted(),
    )

    for (const { message, event_ids } of cards) {
      expect(message.embeds?.[0]?.description?.length).toBeLessThanOrEqual(4000)
      expect(message.embeds?.[0]?.description).toContain('abcdef')
      expect(event_ids.length).toBeGreaterThan(0)
      expect(event_ids.length).toBeLessThanOrEqual(40)
    }

    expect(errors).toHaveBeenCalled()
    expect(JSON.stringify(errors.mock.calls)).toContain('batch.supported_parameters')
  } finally {
    errors.mockRestore()
  }
})

async function prepareBatch(rows: (EventRow & { _id: string })[]) {
  return await prepareDiscordBatch(rows, async (candidates) => candidates.map(() => false))
}
