/**
 * Pure worker decisions from `docs/orca/ingestion-workers.md`. Convex modules read
 * bounded registry views, apply a decision, and commit it atomically.
 */
import type { CurrentScope } from './operators/current'
import type { RecordState } from './tables'

export type NewPair = { from_scan_at: string; scan_at: string; alerts: boolean }

/** Pairs between adjacent ascending times; the first time is only the first pair's predecessor. */
export function chain(times: readonly string[], alerts: boolean): NewPair[] {
  return times.slice(1).map((scan_at, index) => ({
    from_scan_at: times[index] ?? '',
    scan_at,
    alerts,
  }))
}

export type Edges = {
  /** Latest pair's scan. */
  latest: string | null
  /** Earliest pair; its `from_scan_at` is introduced by no pair. */
  earliest: { from_scan_at: string; scan_at: string } | null
}

export type RegisterState = {
  target: { start_at: string; end_at: string } | null
  edges: Edges
  /** Whether a baseline holds the earliest pair's `from_scan_at`. */
  baseline: boolean
}

/** Source scan times in `[atOrAfter, before)`, nearest the requested end first. */
export type ListScans = (listing: {
  atOrAfter: string
  before: string
  limit: number
  order: 'asc' | 'desc'
}) => Promise<string[]>

export type RegisterPlan =
  | { kind: 'bootstrap' | 'forward' | 'backward'; pairs: NewPair[] }
  | { kind: 'baseline'; scan_at: string }
  | { kind: 'idle' }

/** One register step's batch, in priority order: bootstrap, forward, backward, then baseline. */
export async function planRegister(
  { target, edges, baseline }: RegisterState,
  list: ListScans,
  limit: number,
): Promise<RegisterPlan> {
  if (target === null) {
    return { kind: 'idle' }
  }

  const { start_at } = target
  const through = successor(target.end_at)

  if (edges.latest === null || edges.earliest === null) {
    const newest = await list({
      atOrAfter: start_at,
      before: through,
      limit: limit + 1,
      order: 'desc',
    })
    return planned('bootstrap', chain(newest.toReversed(), false))
  }

  const after = await list({
    atOrAfter: successor(edges.latest),
    before: through,
    limit,
    order: 'asc',
  })

  if (after.length > 0) {
    return planned('forward', chain([edges.latest, ...after], true))
  }

  const { from_scan_at } = edges.earliest
  const before = await list({ atOrAfter: start_at, before: from_scan_at, limit, order: 'desc' })

  if (before.length > 0) {
    return planned('backward', chain([...before.toReversed(), from_scan_at], false))
  }

  return baseline ? { kind: 'idle' } : { kind: 'baseline', scan_at: from_scan_at }
}

function planned(kind: 'bootstrap' | 'forward' | 'backward', pairs: NewPair[]): RegisterPlan {
  return pairs.length === 0 ? { kind: 'idle' } : { kind, pairs }
}

/** The next representable instant, so an inclusive end becomes an exclusive bound. */
function successor(time: string): string {
  return new Date(Date.parse(time) + 1).toISOString()
}

export type QueueView<Id> = {
  /** Every baseline, normally at most two while one is being moved. */
  baselines: { id: Id; scan_at: string; state: RecordState; displaced: boolean }[]
  /** Pending pairs newest first, all later than every queued full pair. */
  pending: { id: Id; scan_at: string }[]
  /** Latest complete pair that committed full current candidates. */
  latestCompleteFull: string | null
  /** Whether any full pair is queued or complete. */
  hasFull: boolean
  /** Latest registered pair, which alone carries a current-stats snapshot. */
  latestPair: string | null
  /** Whether any pair is pending or queued, eligible or not. */
  pairsUnsettled: boolean
  /** Accepted records not yet finished, counted up to the capacity. */
  inFlight: number
}

/** Batch: most requests per step. Capacity: most accepted records unfinished at once. */
export type QueueLimits = { batch: number; capacity: number }

export type IngestRequest<Id> = { id: Id; scope: CurrentScope; current_stats: boolean }

export type QueueDecision<Id> =
  | { kind: 'withdraw'; ids: Id[] }
  | { kind: 'ingest'; requests: IngestRequest<Id>[] }
  | { kind: 'baseline'; id: Id }
  | { kind: 'idle' }

function pairScope(behindFull: boolean, hasFull: boolean) {
  if (behindFull) {
    return 'departures'
  }
  return hasFull ? 'changes' : 'full'
}

/** One queue step: the first selection that finds work. */
export function decideQueue<Id>(
  view: QueueView<Id>,
  { batch, capacity }: QueueLimits,
): QueueDecision<Id> {
  const withdrawable = view.baselines.filter(
    ({ displaced, state }) => displaced && (state === 'pending' || state === 'complete'),
  )

  if (withdrawable.length > 0) {
    return { kind: 'withdraw', ids: withdrawable.map(({ id }) => id) }
  }

  // Withdrawals bypass the capacity: they are rare and must not wait behind ingestion.
  const limit = Math.min(batch, capacity - view.inFlight)
  const held = new Set(view.baselines.map(({ scan_at }) => scan_at))
  const requests: IngestRequest<Id>[] = []
  let { hasFull } = view

  for (const { id, scan_at } of view.pending) {
    if (requests.length >= limit) {
      break
    }

    if (held.has(scan_at)) {
      continue
    }

    const behindFull = view.latestCompleteFull !== null && view.latestCompleteFull > scan_at
    const scope = pairScope(behindFull, hasFull)
    requests.push({ id, scope, current_stats: scan_at === view.latestPair })

    // Pairs behind a queued full pair wait until it completes, then commit departures only.
    if (scope === 'full') {
      hasFull = true
      break
    }
  }

  if (requests.length > 0) {
    return { kind: 'ingest', requests }
  }

  if (view.pairsUnsettled) {
    return { kind: 'idle' }
  }

  const [only, ...others] = view.baselines

  return only !== undefined &&
    others.length === 0 &&
    only.state === 'pending' &&
    !only.displaced &&
    view.inFlight < capacity
    ? { kind: 'baseline', id: only.id }
    : { kind: 'idle' }
}
