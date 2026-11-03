import { describe, expect, it } from 'vitest'

import { boundStops, nearestStopIndex } from './bars'
import { advanceGesture, pressShownStop, startGesture } from './gesture'
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

describe('pressShownStop', () => {
  /** A press on the bar the slider shows for an off-grid bound, then the drags that follow. */
  function press(
    thresholds: number[],
    direction: 'max' | 'min',
    bound: number,
    drags: (number | undefined)[],
  ) {
    const stops = boundStops(thresholds, direction)
    const shown = nearestStopIndex(stops, bound)
    const first = pressShownStop(startGesture(bound), stops, shown, shown)
    let { gesture } = first
    const changes = first.change === undefined ? [] : [first.change]

    for (const position of drags) {
      const step = advanceGesture(gesture, position)

      ;({ gesture } = step)

      if (step.change !== undefined) {
        changes.push(step.change)
      }
    }

    return changes
  }

  it('snaps a maximum between thresholds to the pressed bar, in one push', () => {
    expect(press([0.1, 0.5, 1], 'max', 0.37, [])).toEqual([{ replace: false, value: 0.5 }])
  })

  it('snaps a minimum between thresholds to the pressed bar, in one push', () => {
    expect(press([10, 50, 100], 'min', 40, [])).toEqual([{ replace: false, value: 50 }])
  })

  it('replaces for the drags that follow the snap', () => {
    expect(press([0.1, 0.5, 1], 'max', 0.37, [1, undefined])).toEqual([
      { replace: false, value: 0.5 },
      { replace: true, value: 1 },
      { replace: true, value: undefined },
    ])
  })

  it('makes no change when the bound is on its threshold', () => {
    expect(press([10, 50, 100], 'min', 50, [])).toEqual([])
  })

  it('leaves a press on another bar to the slider', () => {
    const stops = boundStops([10, 50, 100], 'min')

    expect(pressShownStop(startGesture(40), stops, 2, 3).change).toBeUndefined()
  })
})
