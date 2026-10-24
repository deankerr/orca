import {
  array,
  assert,
  asyncProperty,
  boolean,
  constantFrom,
  integer,
  option,
  property,
  record,
  tuple,
  uniqueArray,
} from 'fast-check'
import type { Arbitrary } from 'fast-check'
import { expect, test } from 'vitest'

import { decideQueue, planRegister } from './decide'
import type { ListScans, NewPair, QueueView, RegisterState } from './decide'
import type { RecordState } from './tables'

const base = Date.parse('2026-01-01T00:00:00.000Z')
const iso = (offset: number) => new Date(base + offset).toISOString()

// ---------------------------------------------------------------- queue

const states: RecordState[] = ['pending', 'queued', 'complete', 'failed', 'withdrawing']

const queueView = record({
  baselines: array(
    record({
      displaced: boolean(),
      scan: integer({ max: 15, min: 0 }),
      state: constantFrom(...states),
    }),
    { maxLength: 2 },
  ),
  hasFull: boolean(),
  inFlight: integer({ max: 12, min: 0 }),
  latestCompleteFull: option(integer({ max: 15, min: 0 }), { nil: null }),
  latestPair: option(integer({ max: 15, min: 0 }), { nil: null }),
  pairsUnsettled: boolean(),
  pending: uniqueArray(integer({ max: 15, min: 0 }), { maxLength: 12 }),
}).map((draft): QueueView<string> => ({
  baselines: draft.baselines.map(({ scan, ...rest }, index) => ({
    ...rest,
    id: `b${index}`,
    scan_at: iso(scan),
  })),
  hasFull: draft.hasFull,
  inFlight: draft.inFlight,
  latestCompleteFull: draft.latestCompleteFull === null ? null : iso(draft.latestCompleteFull),
  latestPair: draft.latestPair === null ? null : iso(draft.latestPair),
  pairsUnsettled: draft.pairsUnsettled,
  // Newest first, one pair per `scan_at`.
  pending: draft.pending
    .toSorted((a, b) => b - a)
    .map((scan) => ({ id: `p${scan}`, scan_at: iso(scan) })),
}))

const limits = record({
  batch: integer({ max: 8, min: 1 }),
  capacity: integer({ max: 12, min: 1 }),
})

const queueCase = tuple(queueView, limits)

const withdrawable = (view: QueueView<string>) =>
  view.baselines.filter(
    ({ displaced, state }) => displaced && (state === 'pending' || state === 'complete'),
  )

test('a displaced pending or complete baseline is always withdrawn first', () => {
  assert(
    property(queueCase, ([view, limit]) => {
      const expected = withdrawable(view).map(({ id }) => id)
      const decision = decideQueue(view, limit)

      if (expected.length === 0) {
        expect(decision.kind).not.toBe('withdraw')
      } else {
        expect(decision).toEqual({ ids: expected, kind: 'withdraw' })
      }
    }),
  )
})

test('ingest requests respect the batch and the remaining capacity', () => {
  assert(
    property(queueCase, ([view, { batch, capacity }]) => {
      const decision = decideQueue(view, { batch, capacity })

      if (decision.kind === 'ingest') {
        expect(decision.requests.length).toBeGreaterThanOrEqual(1)
        expect(decision.requests.length).toBeLessThanOrEqual(
          Math.min(batch, capacity - view.inFlight),
        )
      }

      if (view.inFlight >= capacity) {
        expect(['withdraw', 'idle']).toContain(decision.kind)
      }
    }),
  )
})

test('requests come from pending in view order without duplicates or held scans', () => {
  assert(
    property(queueCase, ([view, limit]) => {
      const decision = decideQueue(view, limit)

      if (decision.kind !== 'ingest') {
        return
      }

      const ids = decision.requests.map(({ id }) => id)
      const held = new Set(view.baselines.map(({ scan_at }) => scan_at))
      const eligible = view.pending.filter(({ scan_at }) => !held.has(scan_at)).map(({ id }) => id)

      expect(new Set(ids).size).toBe(ids.length)
      // An in-order subsequence of the eligible pairs; in fact a prefix of them.
      expect(ids).toEqual(eligible.slice(0, ids.length))

      const heldPending = view.pending.filter(({ scan_at }) => held.has(scan_at))
      for (const { id } of heldPending) {
        expect(ids).not.toContain(id)
      }
    }),
  )
})

test('at most one full request, last in the batch, and only while no full pair exists', () => {
  assert(
    property(queueCase, ([view, limit]) => {
      const decision = decideQueue(view, limit)

      if (decision.kind !== 'ingest') {
        return
      }

      const { requests } = decision
      const fulls = requests.flatMap(({ scope }, index) => (scope === 'full' ? [index] : []))

      expect(fulls.length).toBeLessThanOrEqual(1)

      if (fulls.length === 1) {
        expect(fulls[0]).toBe(requests.length - 1)
        expect(view.hasFull).toBe(false)
      }

      if (!view.hasFull && requests.length > 0) {
        // The first eligible request is full unless it is behind a complete full pair.
        expect(requests.some(({ scope }) => scope === 'full')).toBe(
          requests.some(({ scope }) => scope !== 'departures'),
        )
      }
    }),
  )
})

test('scope and current stats follow the registry state', () => {
  assert(
    property(queueCase, ([view, limit]) => {
      const decision = decideQueue(view, limit)

      if (decision.kind !== 'ingest') {
        return
      }

      for (const { id, scope, current_stats } of decision.requests) {
        const pair = view.pending.find((candidate) => candidate.id === id)
        expect(pair).toBeDefined()
        const behindFull =
          view.latestCompleteFull !== null &&
          pair !== undefined &&
          pair.scan_at < view.latestCompleteFull

        expect(scope === 'departures').toBe(behindFull)
        expect(current_stats).toBe(pair?.scan_at === view.latestPair)
      }
    }),
  )
})

test('a baseline is queued only alone, pending, settled, in place, and within capacity', () => {
  assert(
    property(queueCase, ([view, { batch, capacity }]) => {
      const decision = decideQueue(view, { batch, capacity })

      if (decision.kind === 'baseline') {
        const [only, ...others] = view.baselines

        expect(others).toEqual([])
        expect(only?.id).toBe(decision.id)
        expect(only?.state).toBe('pending')
        expect(only?.displaced).toBe(false)
        expect(view.pairsUnsettled).toBe(false)
        expect(view.inFlight).toBeLessThan(capacity)
      }
    }),
  )
})

test('an unsettled view with no eligible work stays idle', () => {
  assert(
    property(queueCase, ([view, limit]) => {
      const decision = decideQueue({ ...view, pairsUnsettled: true }, limit)

      expect(decision.kind).not.toBe('baseline')
    }),
  )
})

// ------------------------------------------------------------- register

/** A sorted set of source times honoring the `ListScans` contract. */
const sourceListing =
  (times: readonly string[]): ListScans =>
  async ({ atOrAfter, before, limit, order }) => {
    const inRange = times.filter((time) => time >= atOrAfter && time < before)
    return order === 'asc' ? inRange.slice(0, limit) : inRange.toReversed().slice(0, limit)
  }

type Registry = { pairs: Map<string, string>; baseline: string | null }

function stateOf(registry: Registry, target: RegisterState['target']): RegisterState {
  const scans = [...registry.pairs.keys()].toSorted()
  const [first] = scans
  const last = scans.at(-1)

  if (first === undefined || last === undefined) {
    return { baseline: false, edges: { earliest: null, latest: null }, target }
  }

  const from_scan_at = registry.pairs.get(first) ?? ''

  return {
    baseline: registry.baseline === from_scan_at,
    edges: { earliest: { from_scan_at, scan_at: first }, latest: last },
    target,
  }
}

type Range = { start: number; end: number }

/** `initial` lies within `range`: the target is widened from it to `range` mid-run. */
type RegisterCase = { initial: Range; limit: number; offsets: number[]; range: Range }

const ordered = ([a, b]: [number, number]): Range =>
  a <= b ? { end: b, start: a } : { end: a, start: b }

const registerCase: Arbitrary<RegisterCase> = record({
  limit: integer({ max: 6, min: 1 }),
  offsets: uniqueArray(integer({ max: 40, min: 0 }), { maxLength: 25 }),
  // Range edges may fall on, between, or outside source times.
  range: tuple(integer({ max: 42, min: -2 }), integer({ max: 42, min: -2 })).map(ordered),
}).chain((draft) =>
  tuple(
    integer({ max: draft.range.end, min: draft.range.start }),
    integer({ max: draft.range.end, min: draft.range.start }),
  )
    .map(ordered)
    .map((initial): RegisterCase => ({ ...draft, initial })),
)

const targetOf = ({ start, end }: Range) => ({ end_at: iso(end), start_at: iso(start) })

/** Registers until idle under the initial target, then widens it to the final range and continues. */
async function converge({ initial, limit, offsets, range }: RegisterCase) {
  const times = offsets.toSorted((a, b) => a - b).map(iso)
  const target = targetOf(range)
  const list = sourceListing(times)
  const registry: Registry = { baseline: null, pairs: new Map() }
  const log: { before: RegisterState; kind: string; pairs: NewPair[] }[] = []
  let settled = true

  for (const phase of [targetOf(initial), target]) {
    settled = false

    // Each step registers at least one pair or baseline, so this bounds a correct run.
    for (let step = 0; step <= times.length + 2 && !settled; step += 1) {
      const before = stateOf(registry, phase)
      const plan = await planRegister(before, list, limit)

      if (plan.kind === 'idle') {
        settled = true
      } else if (plan.kind === 'baseline') {
        registry.baseline = plan.scan_at
        log.push({ before, kind: plan.kind, pairs: [] })
      } else {
        for (const pair of plan.pairs) {
          registry.pairs.set(pair.scan_at, pair.from_scan_at)
        }
        log.push({ before, kind: plan.kind, pairs: plan.pairs })
      }
    }

    if (!settled) {
      return { log, registry, selected: [], settled }
    }
  }

  return {
    log,
    registry,
    selected: times.filter((t) => t >= target.start_at && t <= target.end_at),
    settled,
  }
}

let forwardBatches = 0

test('each register batch chains adjacent source times within the target, ascending', async () => {
  forwardBatches = 0

  await assert(
    asyncProperty(registerCase, async (input) => {
      const { log, selected } = await converge(input)
      const times = input.offsets.toSorted((a, b) => a - b).map(iso)
      const inRange = new Set(selected)

      for (const { before, kind, pairs } of log) {
        expect(pairs.length).toBeLessThanOrEqual(input.limit)

        for (const [index, pair] of pairs.entries()) {
          expect(pair.from_scan_at < pair.scan_at).toBe(true)
          expect(inRange.has(pair.scan_at)).toBe(true)
          // Adjacent in the source, so nothing is skipped.
          expect(times[times.indexOf(pair.scan_at) - 1]).toBe(pair.from_scan_at)
          expect(pair.alerts).toBe(kind === 'forward')
          if (index > 0) {
            expect(pair.from_scan_at).toBe(pairs[index - 1]?.scan_at)
          }
        }

        if (kind === 'forward') {
          forwardBatches += 1
          expect(pairs[0]?.from_scan_at).toBe(before.edges.latest)
        }
        if (kind === 'backward') {
          expect(pairs.at(-1)?.scan_at).toBe(before.edges.earliest?.from_scan_at)
        }
      }
    }),
  )

  // Widening the target must exercise forward batches, or their checks are vacuous.
  expect(forwardBatches).toBeGreaterThan(0)
})

test('widening a settled target registers forward batches that chain from the latest pair', async () => {
  const offsets = Array.from({ length: 11 }, (_, index) => index)
  const { log, registry } = await converge({
    initial: { end: 3, start: 0 },
    limit: 2,
    offsets,
    range: { end: 10, start: 0 },
  })
  const forward = log.filter(({ kind }) => kind === 'forward')

  expect(forward.length).toBeGreaterThan(0)
  expect(forward.every(({ pairs }) => pairs.every(({ alerts }) => alerts))).toBe(true)
  expect(forward[0]?.pairs[0]?.from_scan_at).toBe(iso(3))
  expect(registry.pairs.size).toBe(10)
})

test('registration converges to the whole target chain and a baseline, for any batch limit', async () => {
  await assert(
    asyncProperty(registerCase, async (input) => {
      const { registry, selected, settled } = await converge(input)

      expect(settled).toBe(true)

      const scans = [...registry.pairs.keys()].toSorted()
      expect(scans).toEqual(selected.slice(1))

      for (const [index, scan_at] of scans.entries()) {
        expect(registry.pairs.get(scan_at)).toBe(selected[index])
      }

      expect(registry.baseline).toBe(selected.length >= 2 ? (selected[0] ?? null) : null)
    }),
  )
})

test('without a target the register worker is idle', async () => {
  await assert(
    asyncProperty(registerCase, async ({ limit, offsets }) => {
      const list = sourceListing(offsets.toSorted((a, b) => a - b).map(iso))
      const plan = await planRegister(
        { baseline: false, edges: { earliest: null, latest: null }, target: null },
        list,
        limit,
      )

      expect(plan).toEqual({ kind: 'idle' })
    }),
  )
})
