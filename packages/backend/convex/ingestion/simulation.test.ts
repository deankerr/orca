import { expect, test } from 'vitest'

import { EVENT_KINDS, emptyTally, simulate } from './simulation.testing'

/** `SIM_SEED=n` replays one scenario; `SIM_RUNS=n` changes how many seeds run. */
const seeds = (): number[] => {
  const only = process.env.SIM_SEED
  if (only !== undefined && only !== '') {
    return [Number(only)]
  }
  const runs = Number(process.env.SIM_RUNS ?? 20)
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
