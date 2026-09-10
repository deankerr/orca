import { expect, test } from 'bun:test'

import { DAY, dailyTrace, historyTraces, tagPrices } from './history-data'
import type { History } from './history-data'

const iso = (at: number) => new Date(at).toISOString()

test('steps normalize unmetered values and never carry quotes across a relisting', () => {
  const history: History = {
    asOf: 4 * DAY,
    endpoints: [
      {
        id: 'one',
        tag: 'provider',
        listings: [
          { scan_at: iso(0), state: 'listed' },
          { scan_at: iso(DAY), state: 'unlisted' },
          { scan_at: iso(2 * DAY), state: 'listed' },
        ],
        prices: [
          { scan_at: iso(0), meters: { prompt: '1' }, overrides: undefined },
          { scan_at: iso(DAY / 2), meters: { prompt: '2' }, overrides: undefined },
          { scan_at: iso(2.5 * DAY), meters: { prompt: '3' }, overrides: [{ utc_start: '12:00' }] },
          { scan_at: iso(3 * DAY), meters: { prompt: '0' }, overrides: undefined },
          { scan_at: iso(3.5 * DAY), meters: {}, overrides: undefined },
        ],
      },
    ],
  }
  const traces = historyTraces(history, 'prompt')
  expect(traces.map(({ start, end }) => [start, end])).toEqual([
    [0, DAY],
    [2.5 * DAY, 3 * DAY],
  ])
  expect(tagPrices(traces, 'provider', 2.25 * DAY, history.asOf)).toEqual([])
  expect(traces[1].scheduled).toBe(true)
  expect(tagPrices(traces, 'provider', DAY, history.asOf)).toEqual([])
})

test('daily samples lose excursions but preserve boundaries, latest quote and shared-tag ranges', () => {
  const trace = {
    id: 'one',
    tag: 'provider',
    start: 0,
    end: 2.5 * DAY,
    scheduled: false,
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
    const history: History = {
      asOf: DAY,
      endpoints: [
        {
          id: 'one',
          tag: 'provider',
          listings: [
            { scan_at: iso(0), state: 'listed' },
            ...(unlisted ? [{ scan_at: iso(DAY), state: 'unlisted' as const }] : []),
          ],
          prices: [
            { scan_at: iso(0), meters: { prompt: '1' }, overrides: undefined },
            ...(unlisted
              ? []
              : [{ scan_at: iso(DAY), meters: { prompt: '0' }, overrides: undefined }]),
          ],
        },
      ],
    }
    const traces = historyTraces(history, 'prompt')
    expect(tagPrices(traces, 'provider', DAY, history.asOf)).toEqual([])
    expect(
      tagPrices(
        traces.map((trace) => dailyTrace(trace, history.asOf)),
        'provider',
        DAY,
        history.asOf,
      ),
    ).toEqual([])
  }
})
