/* oxlint-disable typescript/no-unsafe-type-assertion -- An indexed database double exercises the registered query without deploying test mutations. */
import { expect, test } from 'bun:test'
import { rejects } from 'node:assert/strict'

import type { QueryCtx } from '../../_generated/server'
import { encodePricing } from '../../entities'
import { compare } from '../../events/compare'
import type { EventRow } from '../../events/table'
import type { JsonValue } from '../../json'
import { prepare as prepareShared } from '../shared/prepare'
import { check, PRICE_CHANGE_COUNT, PRICE_CHANGE_WINDOW_HOURS } from './frequency'
import type { PricingCandidate } from './frequency'
import { prepareBatch } from './prepare'

const scan_at = '2026-10-03T12:00:00.000Z'
const hour = 3_600_000
const at = (offset: number) => new Date(Date.parse(scan_at) + offset * hour).toISOString()

function history(rows: PricingCandidate[]) {
  return {
    db: {
      query: (table: string) => {
        expect(table).toBe('v4_endpoint_pricing_history')
        let selected = rows

        const range = {
          eq: (field: keyof PricingCandidate, value: string) => {
            expect(field).toBe('endpoint_id')
            selected = selected.filter((row) => row[field] === value)
            return range
          },
          gte: (field: keyof PricingCandidate, value: string) => {
            expect(field).toBe('scan_at')
            selected = selected.filter((row) => row[field] >= value)
            return range
          },
          lt: (field: keyof PricingCandidate, value: string) => {
            expect(field).toBe('scan_at')
            selected = selected.filter((row) => row[field] < value)
            return range
          },
        }

        const query = {
          withIndex: (name: string, select: (q: typeof range) => unknown) => {
            expect(name).toBe('by_endpoint_id_and_scan_at')
            select(range)
            return query
          },
          order: (direction: string) => {
            expect(direction).toBe('desc')
            selected = selected.toSorted((a, b) => b.scan_at.localeCompare(a.scan_at))
            return query
          },
          take: async (count: number) => {
            expect(count).toBe(PRICE_CHANGE_COUNT)
            return selected.slice(0, count)
          },
        }
        return query
      },
    },
  } as unknown as QueryCtx
}

const read = (
  check as unknown as {
    _handler: (ctx: QueryCtx, args: { candidates: PricingCandidate[] }) => Promise<boolean[]>
  }
)._handler

test('counts only prior endpoint quotes in the inclusive rolling window, bounded at the threshold', async () => {
  const preceding = Array.from({ length: PRICE_CHANGE_COUNT - 1 }, (_, i) => ({
    endpoint_id: 'one',
    scan_at: at(-i - 1),
  }))

  const rows = [
    ...preceding,
    { endpoint_id: 'one', scan_at: at(-PRICE_CHANGE_WINDOW_HOURS - 1) },
    { endpoint_id: 'one', scan_at },
    { endpoint_id: 'one', scan_at: at(1) },
    ...Array.from({ length: 10 }, () => ({ endpoint_id: 'other', scan_at: at(-1) })),
  ]

  const candidates = [{ endpoint_id: 'one', scan_at }]

  expect(await read(history(rows), { candidates })).toEqual([false])
  rows.push({ endpoint_id: 'one', scan_at: at(-PRICE_CHANGE_WINDOW_HOURS) })
  expect(await read(history(rows), { candidates })).toEqual([true])

  // Replaying later still uses the event's observation; a subsequent quiet period recovers.
  expect(
    await read(history(rows), {
      candidates: [
        ...candidates,
        { endpoint_id: 'missing', scan_at },
        { endpoint_id: 'one', scan_at: at(PRICE_CHANGE_WINDOW_HOURS + 2) },
      ],
    }),
  ).toEqual([true, false, false])
})

function update(id: string, before: JsonValue, after: JsonValue): EventRow & { _id: string } {
  const [change] = compare({ [id]: before }, { [id]: after })

  return {
    _id: id,
    entity_id: id,
    entity_kind: 'endpoint',
    type: 'UPDATE',
    scan_at,
    context: {
      model: { model_id: 'author/model', display_name: 'Model' },
      provider: { provider_id: 'provider', display_name: 'Provider' },
      endpoint: { endpoint_id: id, provider_tag: 'provider', provider_display_name: 'Provider' },
    },
    change_json: JSON.stringify(change),
  }
}

const oldPrice = { pricing: { meters: { prompt: '1' } } }
const newPrice = { pricing: { meters: { prompt: '2' } } }

test('frequency removes pricing only, preserves quiet endpoints, and does not change shared consumers', async () => {
  const rows = [
    update('frequent', oldPrice, newPrice),
    update(
      'mixed',
      { ...oldPrice, metadata: { context_length: 100 } },
      {
        ...newPrice,
        metadata: { context_length: 200 },
      },
    ),
    update('quiet', oldPrice, newPrice),
  ]

  const captured = JSON.stringify(rows)
  let queries = 0

  const result = await prepareBatch(rows, async (candidates) => {
    queries += 1
    expect(candidates).toEqual(rows.map((row) => ({ endpoint_id: row.entity_id, scan_at })))
    return [true, true, false]
  })

  expect(queries).toBe(1)
  expect(result.skipped).toBe(1)

  expect(result.alerts).toMatchObject([
    { event_id: 'mixed', event: { changes: [{ path: 'context_length' }] } },
    { event_id: 'quiet', event: { changes: [{ path: 'pricing.prompt' }] } },
  ])

  expect(
    result.alerts[0]?.type === 'event' && 'changes' in result.alerts[0].event
      ? result.alerts[0].event.changes.length
      : 0,
  ).toBe(1)

  const [first] = rows

  if (first === undefined) {
    throw new Error('Expected a pricing event')
  }

  expect(prepareShared(first)).not.toBeNull()
  expect(JSON.stringify(rows)).toBe(captured)
})

test('cheap exclusions, lifecycle and schedule changes do not read history', async () => {
  const before = { discount: 0, meters: { prompt: '1' }, overrides: [{ utc_days: ['saturday'] }] }
  const after = { ...before, overrides: [{ utc_days: ['sunday'] }] }
  const schedule = update('schedule', { pricing: before }, { pricing: after })

  if (schedule.entity_kind !== 'endpoint') {
    throw new Error('Expected an endpoint')
  }

  schedule.context.pricing = { before: encodePricing(before), after: encodePricing(after) }

  const lifecycle = {
    ...update('arrival', oldPrice, newPrice),
    type: 'ADD' as const,
    change_json: JSON.stringify({
      type: 'ADD',
      key: 'arrival',
      value: {
        endpoint_id: 'arrival',
        model_id: 'author/model',
        provider_id: 'provider',
        provider_tag: 'provider',
        variant: 'standard',
        provider_display_name: 'Provider',
        pricing: { discount: 0, meters: { prompt: '2' } },
        metadata: {},
      },
    }),
  }

  const rows = [
    update('small', oldPrice, { pricing: { meters: { prompt: '1.001' } } }),
    update(
      'metadata',
      { metadata: { context_length: 100 } },
      { metadata: { context_length: 200 } },
    ),
    schedule,
    lifecycle,
  ]

  const result = await prepareBatch(rows, async () => {
    throw new Error('Unexpected history query')
  })

  expect(result.skipped).toBe(1)
  expect(result.alerts).toHaveLength(3)
  expect(result.alerts[1]).toMatchObject({ event: { changes: [{ path: 'pricing.overrides' }] } })
})

test('filtering precedes batching and database failures propagate', async () => {
  const rows = Array.from({ length: 5 }, (_, i) => update(`endpoint-${i}`, oldPrice, newPrice))
  const result = await prepareBatch(rows, async () => [true, false, false, false, false])

  expect(result.skipped).toBe(1)
  expect(result.alerts).toHaveLength(4)
  expect(result.alerts.every((alert) => alert.type === 'event')).toBe(true)

  await rejects(
    prepareBatch(rows, async () => {
      throw new Error('History unavailable')
    }),
    /History unavailable/u,
  )
})
