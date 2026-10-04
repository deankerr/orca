import { expect, spyOn, test } from 'bun:test'
import { deepEqual } from 'node:assert/strict'

import { compare } from '../../events/compare'
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
  expect(batchAlerts(input.slice(0, 4))).toEqual(input.slice(0, 4))
  expect(batchAlerts(Array.from({ length: 5 }, () => bucket(0)))).toHaveLength(5)
})

test('keeps scans, kinds, operations, values, and lifecycle events separate', () => {
  const input = Array.from({ length: 4 }, (_, i) => bucket(i))
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

  const numeric = Array.from({ length: 4 }, (_, i) =>
    bucket(i, [{ type: 'field_updated', path: 'context_length', before: 1, after: 2 }]),
  )
  const distinct: FieldChange[] = [
    { type: 'field_updated', path: 'context_length', before: '1', after: '2' },
    { type: 'field_added', path: 'context_length', after: 2 },
    { type: 'field_updated', path: 'context_length', before: null, after: 2 },
  ]

  expect(
    batchAlerts([...numeric, ...distinct.map((change, i) => bucket(i + 4, [change]))]),
  ).toHaveLength(7)
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
      ['provider', 'dataPolicy.privacyPolicyURL', 'https://example.com/legal/privacy'],
    ],
    [
      bucket(0).event,
      unique,
      ['author/model-0', 'provider/fp8', 'abcdef', 'max_output', '943,718', '131,072'],
    ],
    [
      bucket(0).event,
      { type: 'field_updated', path: 'data_policy.retentionDays', before: 30, after: 7 },
      ['retentionDays', '30 days', '7 days'],
    ],
  ]

  for (const [event, change, expected] of cases) {
    const cards = batchCards({
      type: 'batch',
      change,
      members: [{ type: 'event', event_id: 'source', event }],
    })
    const text = JSON.stringify(cards)

    for (const part of expected) {
      expect(text).toContain(part)
    }
  }

  const members = Array.from({ length: 100 }, (_, i) => bucket(i))
  const cards = batchCards({ type: 'batch', change: shared, members })

  expect(cards.length).toBeGreaterThan(1)
  expect(cards.flatMap((card) => card.event_ids).toSorted()).toEqual(
    members.map((member) => member.event_id).toSorted(),
  )

  for (const { message, event_ids } of cards) {
    expect(message.embeds?.[0]?.description?.length).toBeLessThanOrEqual(4000)
    expect(event_ids.length).toBeLessThanOrEqual(40)
    expect(message.allowed_mentions).toEqual({ parse: [] })
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
    const cards = batchCards({
      type: 'batch',
      change: { ...shared, removed: Array.from({ length: 200 }, (_, i) => `parameter-${i}`) },
      members,
    })

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
