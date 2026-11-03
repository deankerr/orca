/**
 * One pointer gesture on a histogram: a press and the drags that follow it. The whole gesture is a
 * single history entry, so Back undoes it in one step to the bound from before the press.
 */
export interface BoundGesture {
  /** The bound the gesture last set, or the bound at the press before it has set one. */
  last: number | undefined
  /** Whether the gesture has pushed its history entry. */
  pushed: boolean
}

/** How a gesture's next bound changes the URL. */
export interface BoundChange {
  /** Replace the current history entry instead of pushing a new one. */
  replace: boolean
  value: number | undefined
}

/** A gesture after one pointer position, with the change it makes, if any. */
export interface GestureStep {
  change: BoundChange | undefined
  gesture: BoundGesture
}

/** A gesture beginning at the current bound. */
export function startGesture(bound: number | undefined): BoundGesture {
  return { last: bound, pushed: false }
}

/**
 * Advance a gesture to the bound under the pointer. Only an actual change counts: the first one
 * pushes, so the pre-gesture bound stays in history even when the press lands on it, and later ones
 * replace. Compares against the gesture's own last bound, since the rendered bound lags a fast drag.
 */
export function advanceGesture(gesture: BoundGesture, next: number | undefined): GestureStep {
  if (next === gesture.last) {
    return { change: undefined, gesture }
  }

  return {
    change: { replace: gesture.pushed, value: next },
    gesture: { last: next, pushed: true },
  }
}

/**
 * Begin a gesture with a press on `pressed`, a stop index. A slider shows a bound that sits between
 * thresholds, such as one from the URL, at its nearest stop, and reports no change when that stop is
 * pressed, so the bound would stay off its threshold. A press on the shown stop therefore sets the
 * stop's exact threshold itself, as the first change of the gesture. A press elsewhere is left to the
 * slider, which reports it as a change.
 */
export function pressShownStop(
  gesture: BoundGesture,
  stops: readonly (number | undefined)[],
  shown: number,
  pressed: number,
): GestureStep {
  return pressed === shown ? advanceGesture(gesture, stops[shown]) : { change: undefined, gesture }
}
