import { expect, test } from 'vitest'

import { EVENT_KINDS, emptyTally, simulate } from './simulation.testing'

/** Reads an integer environment variable of at least `min`; unset or empty yields `fallback`. */
const integerFromEnv = (name: string, min: number, fallback: number | undefined) => {
  const raw = process.env[name]
  if (raw === undefined || raw === '') {
    return fallback
  }
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${name} must be an integer of at least ${min}, received "${raw}"`)
  }
  return value
}

/** `SIM_SEED=n` replays one scenario; `SIM_RUNS=n` changes how many seeds run. */
const seeds = (): number[] => {
  const only = integerFromEnv('SIM_SEED', 0, undefined)
  if (only !== undefined) {
    return [only]
  }
  const runs = integerFromEnv('SIM_RUNS', 1, 20) ?? 20
  return Array.from({ length: runs }, (_, index) => index + 1)
}

test(
  'ingestion converges to the fault-free result under injected faults',
  async () => {
    const total = emptyTally()
    const selected = seeds()

    for (const seed of selected) {
      const { tally } = await simulate(seed)
      for (const kind of EVENT_KINDS) {
        total[kind] += tally[kind]
      }
    }

    console.info('simulation fault counts', total)
    if (selected.length > 1) {
      // A simulation that never injects a fault proves nothing.
      for (const kind of EVENT_KINDS) {
        expect(total[kind], `${kind} occurred`).toBeGreaterThan(0)
      }
    }
  },
  60_000 + seeds().length * 2000,
)
