import { describe, expect, it } from 'vitest'

import { advanceGesture, startGesture } from './gesture'
import type { BoundChange, BoundGesture } from './gesture'

/** Replay a gesture's pointer positions and collect the changes it makes. */
function run(start: number | undefined, positions: (number | undefined)[]): BoundChange[] {
  let gesture: BoundGesture = startGesture(start)
  const changes: BoundChange[] = []

  for (const position of positions) {
    const step = advanceGesture(gesture, position)

    ;({ gesture } = step)

    if (step.change !== undefined) {
      changes.push(step.change)
    }
  }

  return changes
}

describe('advanceGesture', () => {
  it('pushes a press that changes the bound', () => {
    expect(run(75, [100])).toEqual([{ replace: false, value: 100 }])
  })

  it('pushes once, then replaces, over a drag', () => {
    expect(run(75, [100, 125, 150])).toEqual([
      { replace: false, value: 100 },
      { replace: true, value: 125 },
      { replace: true, value: 150 },
    ])
  })

  it('pushes on the first actual change when the press lands on the current bound', () => {
    expect(run(75, [75, 75, 150, 200])).toEqual([
      { replace: false, value: 150 },
      { replace: true, value: 200 },
    ])
  })

  it('pushes the first change from no bound', () => {
    expect(run(undefined, [undefined, 10])).toEqual([{ replace: false, value: 10 }])
  })

  it('can drag back to the starting bound after pushing', () => {
    expect(run(75, [150, 75])).toEqual([
      { replace: false, value: 150 },
      { replace: true, value: 75 },
    ])
  })

  it('makes no change for a gesture that never moves the bound', () => {
    expect(run(75, [75, 75])).toEqual([])
  })

  it('starts the next gesture afresh', () => {
    expect(run(150, [200])).toEqual([{ replace: false, value: 200 }])
  })
})
