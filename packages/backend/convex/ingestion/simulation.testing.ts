import type { WorkId } from '@convex-dev/workpool'
import { drainScheduledFunctions } from '@orca/config/testing'
import { expect, vi } from 'vitest'

import { internal } from '#generated/api'
import type { Doc } from '#generated/dataModel'
import * as scans from '#scans'

import { setup } from '../harness.testing'
import type { Harness } from '../harness.testing'
import { expectIngestionInvariants } from './invariants.testing'
import { hour, random as lcg, rawScan, scan, specs } from './operators/testing'
import type { ScanSpec } from './operators/testing'
import { projections, referenceProjection, unversioned } from './projections.testing'
import { writeRecords } from './records'
import { INGESTION_RECORDS_TABLE } from './tables'

/**
 * A seeded simulation of the whole ingestion system. Workpool completions run inside the
 * component, so lost callbacks cannot be intercepted; faults instead fail the executed work or
 * reproduce a fault's end state between partial scheduling slices. The real functions then drive
 * to quiescence and end-to-end invariants are checked. Everything derives from one seed.
 */

type Doc_ = Doc<typeof INGESTION_RECORDS_TABLE>

interface SimulationEvents {
  [name: string]: (all: Doc_[]) => Promise<void>
}

export const EVENT_KINDS = [
  'processFailure',
  'terminalFailure',
  'lostCompletion',
  'lostCompletionConfirmed',
  'staleCompletion',
  'duplicateCompletion',
  'operatorRetry',
  'cronTick',
  'scanArrival',
  'targetWidened',
  'baselineWithdrawn',
] as const

type EventKind = (typeof EVENT_KINDS)[number]

export type Tally = Record<EventKind, number>

export const emptyTally = (): Tally => ({
  baselineWithdrawn: 0,
  cronTick: 0,
  duplicateCompletion: 0,
  lostCompletion: 0,
  lostCompletionConfirmed: 0,
  operatorRetry: 0,
  processFailure: 0,
  scanArrival: 0,
  staleCompletion: 0,
  targetWidened: 0,
  terminalFailure: 0,
})

/** Seeded generator over the shared LCG; the seed is scrambled so adjacent seeds diverge. */
function prng(seed: number) {
  const next = lcg((seed * 2_654_435_761 + 12_345) % 2 ** 32)
  Array.from({ length: 8 }, () => next())
  const int = (low: number, high: number) => low + Math.floor(next() * (high - low + 1))
  const chance = (probability: number) => next() < probability

  const pick = <T>(items: readonly T[]): T => {
    const item = items[int(0, items.length - 1)]

    if (item === undefined) {
      throw new Error('Cannot pick from an empty list')
    }

    return item
  }

  return { chance, int, pick }
}

type Failure = { kind: 'random'; rate: number } | { kind: 'poisoned'; scans: number[] }

type Scenario = {
  arrivals: number[][]
  end: number
  failure: Failure
  initial: number[]
  parallelism: number
  specs: ScanSpec[]
  start: number
  steps: number
  widenings: number[]
}

/** Scan indexes are hours; arrivals come after every initial scan, as forward collection does. */
function scenario(seed: number): Scenario {
  const random = prng(seed)
  const base = random.int(7, 10)
  const arrivalCount = random.int(0, 3)
  const end = base + arrivalCount - 1

  // The newest three initial scans always exist, so the final window holds at least one pair.
  const initial = Array.from({ length: base }, (_, index) => index).filter(
    (index) => index >= base - 3 || random.chance(0.85),
  )

  const arrivals: number[][] = []

  for (let index = base; index <= end; index += 1) {
    const last = arrivals.at(-1)

    if (last !== undefined && random.chance(0.4)) {
      last.push(index)
    } else {
      arrivals.push([index])
    }
  }

  const start = random.int(Math.floor(base / 2), base - 3)
  const widenings: number[] = []
  let at = start

  for (let count = random.int(0, 2); count > 0 && at > 0; count -= 1) {
    at = random.int(Math.max(0, at - 4), at - 1)
    widenings.push(at)
  }

  return {
    arrivals,
    end,
    failure: random.chance(0.5)
      ? { kind: 'random', rate: random.pick([0.15, 0.4, 0.75]) }
      : { kind: 'poisoned', scans: [random.int(start, end), random.int(start, end)] },
    initial,
    parallelism: random.pick([1, 2, 3, 6]),
    specs: specs(seed, end + 1),
    start,
    steps: random.int(25, 40),
    widenings,
  }
}

type Run = { log: string[]; tally: Tally }

const records = async (t: Harness) =>
  await t.run(async (ctx) => await ctx.db.query(INGESTION_RECORDS_TABLE).collect())

/** The invariants after all injected faults stop and the system settles on its own. */
export async function simulate(seed: number): Promise<Run> {
  const plan = scenario(seed)
  const random = prng(seed + 1_000_003)
  const log: string[] = []
  const tally = emptyTally()

  const note = (message: string) => {
    log.push(`+${Date.now() - Date.parse(hour(100))}ms ${message}`)
  }

  const count = (kind: EventKind, message: string) => {
    tally[kind] += 1
    note(`${kind}: ${message}`)
  }

  vi.useFakeTimers()
  vi.setSystemTime(Date.parse(hour(100)))
  vi.stubEnv('ORCA_INGESTION_PARALLELISM', String(plan.parallelism))
  vi.stubEnv('ORCA_INGESTION_CRON_ENABLED', 'true')

  const t = setup()
  let faulty = true
  const { load } = scans
  vi.spyOn(scans, 'load').mockImplementation(async (ctx, scanAt) => {
    const index = (Date.parse(scanAt) - Date.parse(hour(0))) / 3_600_000

    const fail =
      faulty &&
      (plan.failure.kind === 'random'
        ? random.chance(plan.failure.rate)
        : plan.failure.scans.includes(index))

    if (fail) {
      count('processFailure', `load ${scanAt}`)
      throw new Error('Injected source failure')
    }

    return await load(ctx, scanAt)
  })

  const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    const text = String(args[0])

    if (text.includes('request failed')) {
      tally.terminalFailure += 1
    } else if (text.includes('completion lost')) {
      tally.lostCompletionConfirmed += 1
    }
  })

  const store = async (indexes: number[]) => {
    await t.action(async (ctx) => {
      for (const index of indexes) {
        await scans.store(ctx, rawScan(hour(index), plan.specs[index]))
      }
    })
  }

  try {
    await store(plan.initial)
    let { start } = plan

    const target = async () =>
      await t.mutation(internal.ingestion.target.set, {
        end_at: hour(plan.end),
        start_at: hour(start),
      })

    await target()
    await t.mutation(internal.ingestion.sync.run, {})
    note(`kickoff target ${start}..${plan.end}, parallelism ${plan.parallelism}`)

    const arrivals = [...plan.arrivals]
    const widenings = [...plan.widenings]
    const seenWork = new Set<WorkId>()
    const baselines = new Map<Doc_['_id'], string>()

    const observe = async () => {
      const all = await records(t)

      for (const record of all) {
        if (record.work_id !== undefined) {
          seenWork.add(record.work_id)
        }
      }

      const present = new Set(all.map(({ _id }) => _id))

      for (const [id, scanAt] of baselines) {
        if (!present.has(id)) {
          baselines.delete(id)
          count('baselineWithdrawn', scanAt)
        }
      }

      for (const record of all.filter(({ kind }) => kind === 'baseline')) {
        baselines.set(record._id, record.scan_at)
      }

      return all
    }

    const events: SimulationEvents = {
      arrival: async () => {
        const next = arrivals.shift()

        if (next === undefined) {
          return
        }

        await store(next)
        count('scanArrival', `scans ${next.join(',')}`)

        if (random.chance(0.6)) {
          await t.mutation(internal.ingestion.sync.run, {})
        }
      },
      cron: async () => {
        await t.mutation(internal.ingestion.sync.scheduled, {})
        count('cronTick', 'kickoff and sweep')
      },
      duplicate: async (all) => {
        const settled = all.filter(
          ({ state, work_id }) =>
            (state === 'complete' || state === 'failed') && work_id !== undefined,
        )

        const old = [...seenWork].filter((id) => !all.some(({ work_id }) => work_id === id))
        const record = settled.length > 0 ? random.pick(settled) : undefined

        if (record?.work_id !== undefined && (old.length === 0 || random.chance(0.5))) {
          // The same outcome the record already holds, delivered again.
          await t.mutation(internal.ingestion.execute.onIngested, {
            context: undefined,
            result:
              record.state === 'complete'
                ? { kind: 'success', returnValue: [] }
                : { error: 'Duplicate failure', kind: 'failed' },
            workId: record.work_id,
          })
          count('duplicateCompletion', `${record.state} ${record.scan_at}`)
        } else if (old.length > 0) {
          const workId = random.pick(old)
          await t.mutation(
            internal.ingestion.execute.onIngested,
            random.chance(0.5)
              ? { context: undefined, result: { kind: 'success', returnValue: [] }, workId }
              : {
                  context: undefined,
                  result: { error: 'Stale failure', kind: 'failed' },
                  workId,
                },
          )
          await t.mutation(internal.ingestion.execute.onWithdrawn, {
            context: undefined,
            result: { kind: 'canceled' },
            workId,
          })
          count('staleCompletion', workId)
        }
      },
      lost: async (all) => {
        const finished = all.filter(
          ({ state, work_id }) =>
            (state === 'complete' || state === 'failed') && work_id !== undefined,
        )

        const record = finished.length > 0 ? random.pick(finished) : undefined

        if (record === undefined) {
          return
        }

        // The end state of a completion that never committed: finished work, unsettled record.
        const reverted = await t.run(async (ctx) => {
          const current = await ctx.db.get(INGESTION_RECORDS_TABLE, record._id)

          if (
            current?.work_id === undefined ||
            (current.state !== 'complete' && current.state !== 'failed')
          ) {
            return false
          }

          await writeRecords(ctx, async (writer) => {
            await writer.patch(current, { state: 'queued' })
          })

          return true
        })

        if (reverted) {
          count('lostCompletion', `${record.state} ${record.scan_at}`)
        }
      },
      retry: async (all) => {
        const failed = all.filter(({ state }) => state === 'failed')
        const one = failed.length > 0 && random.chance(0.5) ? random.pick(failed) : undefined

        const reopened = await t.mutation(
          internal.ingestion.queue.retry,
          one === undefined ? {} : { record_id: one._id },
        )

        count('operatorRetry', `reopened ${reopened}`)
      },
      widen: async () => {
        const next = widenings.shift()

        if (next === undefined) {
          return
        }

        start = next
        await target()
        count('targetWidened', `start ${start}`)

        if (random.chance(0.6)) {
          await t.mutation(internal.ingestion.sync.run, {})
        }
      },
    }

    const names = Object.keys(events)

    // Advance scheduled work in small, uneven slices so steps interleave differently per seed.
    const slice = async () => {
      if (random.chance(0.5)) {
        for (let turns = random.int(1, 4); turns > 0; turns -= 1) {
          vi.advanceTimersToNextTimer()
        }
      } else {
        vi.advanceTimersByTime(random.pick([0, 5, 50, 500, 3000, 90_000, 400_000]))
      }

      await t.finishInProgressScheduledFunctions()
    }

    for (let step = 0; step < plan.steps; step += 1) {
      for (let events_ = random.pick([0, 0, 1, 1, 2]); events_ > 0; events_ -= 1) {
        // Earlier events in the step may have moved records, so each reads the current registry.
        await events[random.pick(names)]?.(await observe())
      }

      await slice()
    }

    // Remaining scenario changes land before the faults stop.
    while (arrivals.length > 0) {
      await events.arrival?.(await observe())
      await slice()
    }

    while (widenings.length > 0) {
      await events.widen?.(await observe())
      await slice()
    }

    faulty = false
    note('faults stopped')

    // Quiescence: drain, let the reconciler judge lost completions, reopen failures, repeat.
    // One kickoff registers scans that arrived last; after it only completions, the sweep, and
    // retries move work, so a completion that fails to wake the queue leaves records stuck.
    await t.mutation(internal.ingestion.sync.run, {})
    let quiet = false

    for (let round = 0; round < 40 && !quiet; round += 1) {
      await drainScheduledFunctions(t)
      await t.mutation(internal.ingestion.reconcile.sweep, {})
      await drainScheduledFunctions(t)
      await t.mutation(internal.ingestion.queue.retry, {})
      await drainScheduledFunctions(t)

      const all = await observe()
      const unfinished = all.filter(({ state }) => state !== 'complete')
      quiet = unfinished.length === 0 && all.length >= 2 && vi.getTimerCount() === 0
      note(`round ${round}: ${all.length} records, ${unfinished.length} unfinished`)
    }

    const final = await records(t)
    expect(
      final
        .filter(({ state }) => state !== 'complete')
        .map(({ scan_at, state }) => `${scan_at} ${state}`),
      'records settled',
    ).toEqual([])

    await expectIngestionInvariants(t)

    // The registry is the chain of stored scans in the final target, with one baseline at its start.
    const stored = [...new Set([...plan.initial, ...plan.arrivals.flat()])]
      .filter((index) => index >= start && index <= plan.end)
      .toSorted((a, b) => a - b)

    const pairs = final.filter(({ kind }) => kind === 'pair')
    const baseline = final.filter(({ kind }) => kind === 'baseline')
    expect(
      pairs.map(({ from_scan_at, scan_at }) => `${from_scan_at} ${scan_at}`).toSorted(),
      'pair chain',
    ).toEqual(
      stored
        .slice(1)
        .map((index, position) => `${hour(stored[position] ?? 0)} ${hour(index)}`)
        .toSorted(),
    )
    expect(
      baseline.map(({ scan_at }) => scan_at),
      'one baseline at the earliest scan',
    ).toEqual([hour(stored[0] ?? 0)])

    // Current views and history match a fault-free ingestion of the same scans, with no duplicates.
    const window = stored.map((index) => scan(hour(index), plan.specs[index]))
    expect(unversioned(await projections(t)), 'projections').toEqual(
      unversioned(referenceProjection(window)),
    )
  } catch (error) {
    throw new Error(
      `Simulation failed for seed ${seed} (replay with SIM_SEED=${seed}).\n${JSON.stringify(
        plan,
      )}\n${log.join('\n')}`,
      { cause: error },
    )
  } finally {
    spy.mockRestore()
    vi.restoreAllMocks()
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllEnvs()
  }

  return { log, tally }
}
