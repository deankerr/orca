import { expect, test } from 'vitest'

import { DAY, dailyTrace, pricingHistoryTraces, tagPrices } from './data'
import type { PricingHistory } from './data'

const iso = (at: number) => new Date(at).toISOString()

type Endpoint = PricingHistory['endpoints'][number]

const observation = (at: number, changes: Partial<Endpoint['observations'][number]> = {}) => ({
  detected: true,
  entity_id: 'one',
  entity_kind: 'endpoint' as const,
  model_id: 'model',
  provider_id: 'provider',
  provider_tag: 'provider',
  scan_at: iso(at),
  ...changes,
})

const price = (at: number, meters: Record<string, string>) => ({
  discount: 0,
  endpoint_id: 'one',
  meters,
  scan_at: iso(at),
})

test('steps normalize unmetered values and never carry quotes across a reappearance', () => {
  const pricingHistory: PricingHistory = {
    asOf: 4 * DAY,
    endpoints: [
      {
        id: 'one',
        observations: [observation(0), observation(DAY, { detected: false }), observation(2 * DAY)],
        prices: [
          price(0, { prompt: '1' }),
          price(DAY / 2, { prompt: '2' }),
          price(2.5 * DAY, { prompt: '3' }),
          price(3 * DAY, { prompt: '0' }),
          price(3.5 * DAY, {}),
        ],
      },
    ],
    modelId: 'model',
  }

  const traces = pricingHistoryTraces(pricingHistory, 'prompt')

  expect(traces.map(({ start, end }) => [start, end])).toEqual([
    [0, DAY],
    [2.5 * DAY, 3 * DAY],
  ])

  expect(tagPrices(traces, 'provider', 2.25 * DAY, pricingHistory.asOf)).toEqual([])
  expect(tagPrices(traces, 'provider', DAY, pricingHistory.asOf)).toEqual([])
})

test('daily samples lose excursions but preserve boundaries, latest quote and shared-tag ranges', () => {
  const trace = {
    current: true,
    end: 2.5 * DAY,
    id: 'one',
    samples: [
      [0, 1],
      [DAY / 2, 0.5],
      [DAY, 1],
      [2.25 * DAY, 2],
    ] as [number, number][],
    start: 0,
    tag: 'provider',
  }

  const daily = dailyTrace(trace, trace.end)

  expect(daily.samples).toEqual([
    [0, 1],
    [DAY, 1],
    [2 * DAY, 1],
    [2.25 * DAY, 2],
    [2.5 * DAY, 2],
  ])

  expect(tagPrices([daily], 'provider', DAY / 2, trace.end)).toEqual([1])

  expect(
    tagPrices([daily, { ...daily, id: 'two', samples: [[0, 3]] }], 'provider', DAY, trace.end),
  ).toEqual([1, 3])
})

test('daily sampling retains the last price before tag and model boundaries', () => {
  const history: PricingHistory = {
    asOf: 10 * DAY,
    endpoints: [
      {
        id: 'one',
        observations: [
          observation(0),
          observation(2.75 * DAY, { provider_tag: 'new' }),
          observation(4.75 * DAY, { model_id: 'other', provider_tag: 'new' }),
        ],
        prices: [
          price(0, { prompt: '1' }),
          price(2.5 * DAY, { prompt: '2' }),
          price(4.5 * DAY, { prompt: '3' }),
        ],
      },
    ],
    modelId: 'model',
  }

  const exact = pricingHistoryTraces(history, 'prompt')
  const sampled = exact.map((trace) => dailyTrace(trace, history.asOf))

  expect(sampled[0].samples.at(-1)).toEqual([2.5 * DAY, 2])
  expect(sampled[1].samples[0]).toEqual([2.75 * DAY, 2])
  expect(sampled[1].samples.at(-1)).toEqual([4.5 * DAY, 3])
  expect(tagPrices(sampled, 'provider', 2.7 * DAY, history.asOf)).toEqual([2])
  expect(tagPrices(sampled, 'new', 4.7 * DAY, history.asOf)).toEqual([3])
  expect(tagPrices(sampled, 'new', 4.75 * DAY, history.asOf)).toEqual([])
})

test('a removal or unmetered quote at the latest scan is not a current price', () => {
  for (const unlisted of [true, false]) {
    const pricingHistory: PricingHistory = {
      asOf: DAY,
      endpoints: [
        {
          id: 'one',
          observations: [
            observation(0),
            ...(unlisted ? [observation(DAY, { detected: false })] : []),
          ],
          prices: [price(0, { prompt: '1' }), ...(unlisted ? [] : [price(DAY, { prompt: '0' })])],
        },
      ],
      modelId: 'model',
    }

    const traces = pricingHistoryTraces(pricingHistory, 'prompt')
    expect(tagPrices(traces, 'provider', DAY, pricingHistory.asOf)).toEqual([])

    expect(
      tagPrices(
        traces.map((trace) => dailyTrace(trace, pricingHistory.asOf)),
        'provider',
        DAY,
        pricingHistory.asOf,
      ),
    ).toEqual([])
  }
})

test('historical membership retains moves away and carries quotes through tag and model changes', () => {
  const endpoints = [
    {
      id: 'one',
      observations: [
        observation(2 * DAY, { model_id: 'model:free', provider_tag: 'provider/bf16' }),
        observation(DAY, { provider_tag: 'provider/bf16' }),
        observation(0),
      ],
      prices: [price(0, { prompt: '1' })],
    },
  ]

  const history = { asOf: 3 * DAY, endpoints, modelId: 'model' }
  const traces = pricingHistoryTraces(history, 'prompt')
  expect(traces.map(({ tag, start, end }) => [tag, start, end])).toEqual([
    ['provider', 0, DAY],
    ['provider/bf16', DAY, 2 * DAY],
  ])
  expect(tagPrices(traces, 'provider/bf16', DAY, history.asOf)).toEqual([1])
  expect(tagPrices(traces, 'provider/bf16', 2 * DAY, history.asOf)).toEqual([])
  const moved = pricingHistoryTraces({ ...history, modelId: 'model:free' }, 'prompt')
  expect(moved[0]).toMatchObject({ end: 3 * DAY, samples: [[2 * DAY, 1]], start: 2 * DAY })
})

test('same-price reappearance retains a gap; missing meters replace rather than patch quotes', () => {
  const history: PricingHistory = {
    asOf: 5 * DAY,
    endpoints: [
      {
        id: 'one',
        observations: [
          observation(0),
          observation(DAY, { detected: false }),
          observation(2 * DAY),
          observation(4 * DAY, { provider_tag: 'new' }),
        ],
        prices: [
          price(0, { prompt: '1' }),
          price(2 * DAY, { prompt: '1' }),
          price(3 * DAY, { completion: '2' }),
        ],
      },
    ],
    modelId: 'model',
  }

  const traces = pricingHistoryTraces(history, 'prompt')
  expect(traces.map(({ start, end }) => [start, end])).toEqual([
    [0, DAY],
    [2 * DAY, 3 * DAY],
  ])
  expect(tagPrices(traces, 'provider', 1.5 * DAY, history.asOf)).toEqual([])
  expect(tagPrices(traces, 'provider', 2 * DAY, history.asOf)).toEqual([1])
  expect(tagPrices(traces, 'new', 4 * DAY, history.asOf)).toEqual([])
})
