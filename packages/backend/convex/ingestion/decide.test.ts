import { expect, test } from 'bun:test'
import { ok } from 'node:assert/strict'

import type { Scan } from '#scans/extraction'

import { chain, decideQueue, planRegister } from './decide'
import type { ListScans, QueueView, RegisterState } from './decide'
import type { CurrentScope } from './operators/current'
import { currentTables, expectedCurrent, Retained } from './operators/current.testing'
import { hour, random, scan, specs } from './operators/testing'
import type { RecordState } from './tables'

const view = (overrides: Partial<QueueView<string>>): QueueView<string> => ({
  baselines: [],
  pending: [],
  latestCompleteFull: null,
  hasFull: false,
  latestPair: null,
  pairsUnsettled: false,
  inFlight: 0,
  ...overrides,
})
const pending = (...indexes: number[]) =>
  indexes.map((index) => ({ id: `p${index}`, scan_at: hour(index) }))

test('adjacent times form pairs; one time forms none', () => {
  expect(chain([hour(0), hour(1), hour(2)], true)).toEqual([
    { from_scan_at: hour(0), scan_at: hour(1), alerts: true },
    { from_scan_at: hour(1), scan_at: hour(2), alerts: true },
  ])
  expect(chain([hour(0)], false)).toEqual([])
})

test('the first queued pair is the only full pair until it completes', () => {
  expect(
    decideQueue(view({ pending: pending(5, 4, 3), latestPair: hour(5) }), {
      batch: 10,
      capacity: Infinity,
    }),
  ).toEqual({
    kind: 'ingest',
    requests: [{ id: 'p5', scope: 'full', current_stats: true }],
  })
})

test('pairs behind a complete full pair commit departures; later pairs commit changes', () => {
  const decision = decideQueue(
    view({
      pending: pending(7, 6, 4, 3),
      latestCompleteFull: hour(5),
      hasFull: true,
      latestPair: hour(7),
      pairsUnsettled: true,
    }),
    { batch: 3, capacity: Infinity },
  )

  expect(decision).toEqual({
    kind: 'ingest',
    requests: [
      { id: 'p7', scope: 'changes', current_stats: true },
      { id: 'p6', scope: 'changes', current_stats: false },
      { id: 'p4', scope: 'departures', current_stats: false },
    ],
  })
})

test('displaced baselines are withdrawn first, unless their execution is unfinished', () => {
  const baseline = (state: RecordState) => ({ id: 'b', scan_at: hour(3), state, displaced: true })

  expect(
    decideQueue(view({ baselines: [baseline('complete')], pending: pending(3) }), {
      batch: 5,
      capacity: Infinity,
    }),
  ).toEqual({
    kind: 'withdraw',
    ids: ['b'],
  })
  expect(
    decideQueue(view({ baselines: [baseline('pending')] }), { batch: 5, capacity: Infinity }),
  ).toEqual({
    kind: 'withdraw',
    ids: ['b'],
  })

  // The displacing pair waits while the baseline holds its scan.
  for (const state of ['queued', 'failed', 'withdrawing'] as const) {
    expect(
      decideQueue(
        view({ baselines: [baseline(state)], pending: pending(3), pairsUnsettled: true }),
        { batch: 5, capacity: Infinity },
      ),
    ).toEqual({ kind: 'idle' })
  }
})

test('the only baseline is installed once no pair is pending or queued', () => {
  const baseline = { id: 'b', scan_at: hour(0), state: 'pending' as const, displaced: false }

  expect(
    decideQueue(view({ baselines: [baseline], pairsUnsettled: true }), {
      batch: 5,
      capacity: Infinity,
    }),
  ).toEqual({
    kind: 'idle',
  })
  expect(decideQueue(view({ baselines: [baseline] }), { batch: 5, capacity: Infinity })).toEqual({
    kind: 'baseline',
    id: 'b',
  })
  expect(
    decideQueue(view({ baselines: [baseline, { ...baseline, id: 'c', scan_at: hour(1) }] }), {
      batch: 5,
      capacity: Infinity,
    }),
  ).toEqual({ kind: 'idle' })
})

/** In-memory scan source over a fixed list of ascending times. */
function source(times: () => string[]): ListScans {
  return async ({ atOrAfter, before, limit, order }) => {
    const selected = times().filter((time) => time >= atOrAfter && time < before)
    return (order === 'desc' ? selected.toReversed() : selected).slice(0, limit)
  }
}

test('registration bootstraps, extends forward, backfills, then places one baseline', async () => {
  const times = [1, 2, 3, 4, 5, 6].map(hour)
  const list = source(() => times)
  const target = { start_at: hour(1), end_at: hour(4) }
  const empty: RegisterState = { target, edges: { latest: null, earliest: null }, baseline: false }

  expect(await planRegister(empty, list, 2)).toEqual({
    kind: 'bootstrap',
    pairs: chain([2, 3, 4].map(hour), false),
  })
  expect(
    await planRegister({ ...empty, target: { start_at: hour(4), end_at: hour(4) } }, list, 2),
  ).toEqual({
    kind: 'idle',
  })

  const edges = { latest: hour(4), earliest: { from_scan_at: hour(2), scan_at: hour(3) } }
  const later = { ...target, end_at: hour(6) }
  expect(await planRegister({ target: later, edges, baseline: false }, list, 2)).toEqual({
    kind: 'forward',
    pairs: chain([4, 5, 6].map(hour), true),
  })
  expect(await planRegister({ target, edges, baseline: false }, list, 2)).toEqual({
    kind: 'backward',
    pairs: chain([1, 2].map(hour), false),
  })

  const reached = { ...edges, earliest: { from_scan_at: hour(1), scan_at: hour(2) } }
  expect(await planRegister({ target, edges: reached, baseline: false }, list, 2)).toEqual({
    kind: 'baseline',
    scan_at: hour(1),
  })
  expect(await planRegister({ target, edges: reached, baseline: true }, list, 2)).toEqual({
    kind: 'idle',
  })
})

type SimRecord = {
  id: number
  from_scan_at: string | null
  scan_at: string
  alerts: boolean
  state: RecordState
  scope?: CurrentScope
  request?: CurrentScope
}

test('acceptance fills only the free capacity, and a full queue defers the baseline', () => {
  const limits = { batch: 10, capacity: 4 }
  expect(
    decideQueue(view({ pending: pending(5, 4, 3), hasFull: true, inFlight: 2 }), limits),
  ).toMatchObject({ kind: 'ingest', requests: [{ id: 'p5' }, { id: 'p4' }] })
  expect(
    decideQueue(
      view({ pending: pending(5), hasFull: true, inFlight: 4, pairsUnsettled: true }),
      limits,
    ),
  ).toEqual({ kind: 'idle' })
  expect(
    decideQueue(
      view({
        baselines: [{ id: 'b', scan_at: hour(0), state: 'pending', displaced: false }],
        inFlight: 4,
      }),
      limits,
    ),
  ).toEqual({
    kind: 'idle',
  })
})

const BATCH = 3
const CAPACITY = 5

/**
 * The registry as a reducer: registration, queueing, and terminal outcomes in random
 * interleavings, while scans arrive and the target start moves back.
 */
class Simulation {
  readonly draw: () => number
  readonly scans: Scan[]
  available: number
  target: { start_at: string; end_at: string }
  records: SimRecord[] = []
  readonly retained = currentTables.map((table) => new Retained(table))
  private nextId = 0

  constructor(seed: number) {
    this.draw = random(seed)
    this.scans = specs(seed, 30).map((spec, index) => scan(hour(index), spec))
    this.available = 20
    this.target = { start_at: hour(12), end_at: hour(19) }
  }

  readonly list = source(() => this.scans.slice(0, this.available).map(({ scan_at }) => scan_at))

  get pairs() {
    return this.records
      .filter(({ from_scan_at }) => from_scan_at !== null)
      .toSorted((a, b) => a.scan_at.localeCompare(b.scan_at))
  }

  get baselines() {
    return this.records.filter(({ from_scan_at }) => from_scan_at === null)
  }

  async register() {
    const { pairs } = this
    const latest = pairs.at(-1)
    const [earliest] = pairs
    const from = earliest?.from_scan_at ?? null
    const plan = await planRegister(
      {
        target: this.target,
        edges: {
          latest: latest?.scan_at ?? null,
          earliest:
            earliest === undefined || from === null
              ? null
              : { from_scan_at: from, scan_at: earliest.scan_at },
        },
        baseline: this.baselines.some(({ scan_at }) => scan_at === from),
      },
      this.list,
      BATCH,
    )

    if (plan.kind === 'baseline') {
      this.add({ from_scan_at: null, scan_at: plan.scan_at, alerts: false })
    } else if (plan.kind !== 'idle') {
      for (const pair of plan.pairs) {
        this.add(pair)
      }
    }

    return plan.kind !== 'idle'
  }

  queue() {
    const decision = decideQueue(this.view(), { batch: BATCH, capacity: CAPACITY })

    if (decision.kind === 'withdraw') {
      for (const id of decision.ids) {
        this.update(id, { state: 'withdrawing' })
      }
    } else if (decision.kind === 'ingest') {
      for (const { id, scope } of decision.requests) {
        this.update(id, { state: 'queued', scope, request: scope })
      }
    } else if (decision.kind === 'baseline') {
      this.update(decision.id, { state: 'queued', request: 'full' })
    }

    return decision.kind !== 'idle'
  }

  /** Finish one accepted request; a failure may leave some processes committed. */
  execute(succeed: boolean) {
    const running = this.records.filter(
      ({ state }) => state === 'queued' || state === 'withdrawing',
    )
    const record = running[Math.floor(this.draw() * running.length)]

    if (record === undefined) {
      return false
    }

    if (record.state === 'withdrawing') {
      // Withdrawing releases receipts; current rows stay supported by the scan's evidence.
      this.records = succeed
        ? this.records.filter(({ id }) => id !== record.id)
        : this.records.map((item) => (item.id === record.id ? { ...item, state: 'failed' } : item))
      return true
    }

    const next = this.scanAt(record.scan_at)
    const previous = record.from_scan_at === null ? null : this.scanAt(record.from_scan_at)
    ok(record.request !== undefined)

    for (const retained of this.retained) {
      if (succeed || this.draw() < 0.5) {
        retained.commit({ previous, next }, record.request)
      }
    }

    this.update(record.id, { state: succeed ? 'complete' : 'failed' })
    return true
  }

  retry() {
    const failed = this.records.filter(({ state }) => state === 'failed')
    const record = failed[Math.floor(this.draw() * failed.length)]

    if (record !== undefined) {
      this.update(record.id, { state: 'pending', scope: undefined, request: undefined })
    }

    return record !== undefined
  }

  /** A new scan is collected and the target end follows it. */
  grow() {
    const next = this.scans[this.available]

    if (next !== undefined) {
      this.available += 1
      this.target = { ...this.target, end_at: next.scan_at }
    }
  }

  widen() {
    const start = Math.max(
      0,
      this.scans.findIndex(({ scan_at }) => scan_at === this.target.start_at) - 4,
    )
    this.target = { ...this.target, start_at: hour(start) }
  }

  /** Mirrors `queue.ts`'s bounded registry reads. */
  view(): QueueView<number> {
    const { pairs } = this
    const latest = (scope: CurrentScope, state: RecordState) =>
      pairs.findLast((pair) => pair.scope === scope && pair.state === state)?.scan_at ?? null
    const latestQueuedFull = latest('full', 'queued')
    const latestCompleteFull = latest('full', 'complete')
    const baselines = this.baselines.map(({ id, scan_at, state }) => ({
      id,
      scan_at,
      state,
      displaced: pairs.some((pair) => pair.scan_at === scan_at),
    }))

    return {
      baselines,
      pending: pairs
        .filter(
          ({ state, scan_at }) =>
            state === 'pending' && (latestQueuedFull === null || scan_at > latestQueuedFull),
        )
        .toReversed()
        .slice(0, BATCH + baselines.length)
        .map(({ id, scan_at }) => ({ id, scan_at })),
      latestCompleteFull,
      hasFull: latestQueuedFull !== null || latestCompleteFull !== null,
      latestPair: pairs.at(-1)?.scan_at ?? null,
      pairsUnsettled: pairs.some(({ state }) => state === 'pending' || state === 'queued'),
      inFlight: this.records.filter(({ state }) => state === 'queued' || state === 'withdrawing')
        .length,
    }
  }

  /** Registry invariants that must hold after every committed step. */
  check() {
    const { pairs } = this
    // Withdrawals may overlap: a pending baseline's withdrawal removes nothing.
    const installed = this.baselines.filter(
      ({ state }) => state === 'queued' || state === 'complete',
    )
    expect(installed.length).toBeLessThanOrEqual(1)
    expect(this.records.filter(({ state }) => state === 'queued').length).toBeLessThanOrEqual(
      CAPACITY,
    )

    for (const baseline of this.baselines) {
      const colliding = pairs.find(({ scan_at }) => scan_at === baseline.scan_at)
      expect(colliding === undefined || colliding.state === 'pending').toBe(true)
    }

    for (const [index, pair] of pairs.entries()) {
      expect(pair.from_scan_at).toBe(index === 0 ? pair.from_scan_at : pairs[index - 1]?.scan_at)
    }
  }

  /** Run every worker and request to completion, retrying failures, until nothing changes. */
  async settle() {
    for (let round = 0; round < 1000; round += 1) {
      const progressed = [await this.register(), this.queue(), this.execute(true), this.retry()]

      if (!progressed.some(Boolean)) {
        return
      }
    }

    throw new Error('Simulation did not settle')
  }

  private scanAt(time: string) {
    const found = this.scans.find(({ scan_at }) => scan_at === time)
    ok(found !== undefined)
    return found
  }

  private add(record: Omit<SimRecord, 'id' | 'state'>) {
    this.nextId += 1
    this.records.push({ ...record, id: this.nextId, state: 'pending' })
  }

  private update(id: number, patch: Partial<SimRecord>) {
    this.records = this.records.map((record) =>
      record.id === id ? { ...record, ...patch } : record,
    )
  }
}

test('any interleaving of steps and outcomes settles into one baseline and the reference current view', async () => {
  for (let seed = 0; seed < 150; seed += 1) {
    const sim = new Simulation(seed)

    for (let step = 0; step < 120; step += 1) {
      const roll = sim.draw()

      if (roll < 0.25) {
        await sim.register()
      } else if (roll < 0.5) {
        sim.queue()
      } else if (roll < 0.85) {
        sim.execute(sim.draw() < 0.8)
      } else if (roll < 0.93) {
        sim.retry()
      } else if (roll < 0.97) {
        sim.grow()
      } else {
        sim.widen()
      }

      sim.check()
    }

    await sim.settle()
    sim.check()

    const window = sim.scans.filter(
      ({ scan_at }) =>
        scan_at >= sim.target.start_at &&
        scan_at <= sim.target.end_at &&
        scan_at < hour(sim.available),
    )
    const [first, ...rest] = window
    ok(first !== undefined)

    expect(sim.records.every(({ state }) => state === 'complete')).toBe(true)
    expect(sim.baselines.map(({ scan_at }) => scan_at)).toEqual([first.scan_at])
    expect(sim.pairs.map(({ scan_at }) => scan_at)).toEqual(rest.map(({ scan_at }) => scan_at))

    for (const retained of sim.retained) {
      expect(retained.facts()).toEqual(expectedCurrent(retained.table, window))
    }
  }
})
