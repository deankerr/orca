import { expect, test } from 'bun:test'

import {
  DAY,
  dailyTrace,
  loadEndpointPrices,
  modelEndpoints,
  pricingHistoryTraces,
  tagPrices,
} from './data'
import type { PricingHistory } from './data'

const iso = (at: number) => new Date(at).toISOString()
type Endpoint = PricingHistory['endpoints'][number]
const listing = (at: number, changes: Partial<Endpoint['listings'][number]> = {}) => ({
  endpoint_id: 'one',
  scan_at: iso(at),
  state: 'listed' as const,
  model_id: 'model',
  provider_id: 'provider',
  provider_tag: 'provider',
  ...changes,
})
const price = (at: number, meters: Record<string, string>) => ({
  endpoint_id: 'one',
  scan_at: iso(at),
  discount: 0,
  meters,
})

test('steps normalize unmetered values and never carry quotes across a relisting', () => {
  const pricingHistory: PricingHistory = {
    modelId: 'model',
    asOf: 4 * DAY,
    endpoints: [
      {
        id: 'one',
        listings: [listing(0), listing(DAY, { state: 'unlisted' }), listing(2 * DAY)],
        prices: [
          price(0, { prompt: '1' }),
          price(DAY / 2, { prompt: '2' }),
          price(2.5 * DAY, { prompt: '3' }),
          price(3 * DAY, { prompt: '0' }),
          price(3.5 * DAY, {}),
        ],
      },
    ],
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
    id: 'one',
    tag: 'provider',
    start: 0,
    end: 2.5 * DAY,
    current: true,
    samples: [
      [0, 1],
      [DAY / 2, 0.5],
      [DAY, 1],
      [2.25 * DAY, 2],
    ] as [number, number][],
  }

  const daily = dailyTrace(trace, trace.end)

  expect(daily.samples).toEqual([
    [0, 1],
    [DAY, 1],
    [2 * DAY, 1],
    [2.5 * DAY, 2],
  ])

  expect(tagPrices([daily], 'provider', DAY / 2, trace.end)).toEqual([1])

  expect(
    tagPrices([daily, { ...daily, id: 'two', samples: [[0, 3]] }], 'provider', DAY, trace.end),
  ).toEqual([1, 3])
})

test('a removal or unmetered quote at the latest scan is not a current price', () => {
  for (const unlisted of [true, false]) {
    const pricingHistory: PricingHistory = {
      modelId: 'model',
      asOf: DAY,
      endpoints: [
        {
          id: 'one',
          listings: [listing(0), ...(unlisted ? [listing(DAY, { state: 'unlisted' })] : [])],
          prices: [price(0, { prompt: '1' }), ...(unlisted ? [] : [price(DAY, { prompt: '0' })])],
        },
      ],
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
  const rows = [
    listing(2 * DAY, { model_id: 'model:free', provider_tag: 'provider/bf16' }),
    listing(DAY, { provider_tag: 'provider/bf16' }),
    listing(0),
    listing(0, { endpoint_id: 'unrelated', model_id: 'other' }),
  ]
  const endpoints = modelEndpoints(rows, 'model').map((endpoint) => ({
    ...endpoint,
    prices: [price(0, { prompt: '1' })],
  }))
  expect(endpoints).toHaveLength(1)
  expect(endpoints[0].listings).toHaveLength(3)
  const history = { modelId: 'model', asOf: 3 * DAY, endpoints }
  const traces = pricingHistoryTraces(history, 'prompt')
  expect(traces.map(({ tag, start, end }) => [tag, start, end])).toEqual([
    ['provider', 0, DAY],
    ['provider/bf16', DAY, 2 * DAY],
  ])
  expect(tagPrices(traces, 'provider/bf16', DAY, history.asOf)).toEqual([1])
  expect(tagPrices(traces, 'provider/bf16', 2 * DAY, history.asOf)).toEqual([])
  const moved = pricingHistoryTraces({ ...history, modelId: 'model:free' }, 'prompt')
  expect(moved[0]).toMatchObject({ start: 2 * DAY, end: 3 * DAY, samples: [[2 * DAY, 1]] })
})

test('same-price reappearance retains a gap; missing meters replace rather than patch quotes', () => {
  const history: PricingHistory = {
    modelId: 'model',
    asOf: 5 * DAY,
    endpoints: [
      {
        id: 'one',
        listings: [
          listing(0),
          listing(DAY, { state: 'unlisted' }),
          listing(2 * DAY),
          listing(4 * DAY, { provider_tag: 'new' }),
        ],
        prices: [
          price(0, { prompt: '1' }),
          price(2 * DAY, { prompt: '1' }),
          price(3 * DAY, { completion: '2' }),
        ],
      },
    ],
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

test('endpoint prices follow every cursor, including empty partial pages, at one cutoff', async () => {
  const calls: unknown[] = []
  const pages = [
    { page: [price(DAY, { prompt: '2' })], isDone: false, continueCursor: 'second' },
    { page: [], isDone: false, continueCursor: 'third' },
    { page: [price(0, { prompt: '1' })], isDone: true, continueCursor: '' },
  ]
  const result = await loadEndpointPrices(
    async (args) => {
      calls.push(args)
      return { ...pages[calls.length - 1], as_of: iso(DAY) }
    },
    'one',
    iso(DAY),
  )
  expect(result).toEqual([price(DAY, { prompt: '2' }), price(0, { prompt: '1' })])
  expect(calls).toEqual(
    [null, 'second', 'third'].map((cursor) => ({
      endpoint_id: 'one',
      cutoff: iso(DAY),
      paginationOpts: { cursor, numItems: 500 },
    })),
  )
  expect(
    loadEndpointPrices(
      async ({ paginationOpts }) => {
        if (paginationOpts.cursor === null) {
          return { ...pages[0], as_of: iso(DAY) }
        }
        throw new Error('failed page')
      },
      'one',
      iso(DAY),
    ),
  ).rejects.toThrow('failed page')
})
