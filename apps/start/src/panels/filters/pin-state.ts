/*
 * Which values a list facet pins to the top. Ticking a row must not move it under the pointer, so the
 * pinned set is frozen while the user is in the facet and follows the selection again once they leave.
 * These are pure transitions over `PinState`; `ListFacet` holds the state.
 */

import { toggleValue } from '#endpoints/scope'

export interface PinState {
  /** The ids listed first: the selection as of the last time the facet was settled. */
  pinned: readonly string[]
  /** The selection last observed, to tell a change from a re-render. */
  seen: readonly string[]
  /** Keys of the selections the facet's own ticks have asked for and the URL has not yet returned. */
  own: readonly string[]
  /** The selection the pending ticks lead to, once the URL catches up; the last of the `own` keys. */
  expected: readonly string[]
  pointer: boolean
  focus: boolean
}

/** Order-independent identity of a selection. */
const selectionKey = (selected: readonly string[]) => JSON.stringify(selected.toSorted())

/** The pinned set is a set: the same ids in another order list the same options. */
const samePinned = (left: readonly string[], right: readonly string[]) =>
  selectionKey(left) === selectionKey(right)

export function startPin(selected: readonly string[]): PinState {
  return {
    expected: selected,
    focus: false,
    own: [],
    pinned: selected,
    pointer: false,
    seen: selected,
  }
}

/** Whether the pointer or keyboard focus is in the facet, which keeps the pinned set frozen. */
export const isEngaged = ({ focus, pointer }: PinState) => pointer || focus

/** The pinned set for a selection, which is the current one itself when it already lists the same ids. */
const pinTo = (state: PinState, selected: readonly string[]) =>
  samePinned(state.pinned, selected) ? state.pinned : selected

/**
 * Takes in the selection the URL holds now. A change the facet asked for with a tick is expected
 * and leaves the pinned set alone while the user is in the facet; any other (history, Clear, the global search) repins.
 */
export function observeSelection(state: PinState, selected: readonly string[]): PinState {
  const key = selectionKey(selected)

  if (key === selectionKey(state.seen)) {
    return state
  }

  const index = state.own.indexOf(key)

  if (index !== -1) {
    const own = state.own.slice(index + 1)

    // A tick whose update lands after the user has left would otherwise stay unpinned until the next leave.
    return isEngaged(state)
      ? { ...state, own, seen: selected }
      : { ...state, own, pinned: pinTo(state, selected), seen: selected }
  }

  return { ...state, own: [], pinned: pinTo(state, selected), seen: selected }
}

/** Records a tick's resulting selection as expected, so it does not repin. */
export function expectSelection(state: PinState, next: readonly string[]): PinState {
  return { ...state, expected: next, own: [...state.own, selectionKey(next)] }
}

/**
 * Records a tick of one value as expected. The tick applies to the selection the URL will hold once
 * the earlier pending ticks land, not to the one last observed, so ticks in quick succession each
 * expect the selection they will actually produce and none of them repins.
 */
export function tickSelection(state: PinState, id: string): PinState {
  const base = state.own.length > 0 ? state.expected : state.seen

  return expectSelection(state, toggleValue(base, id))
}

/**
 * Repins to the current selection, as when the filter text changes. A selection that lists the same
 * ids leaves the state and its pinned array as they were, so nothing downstream re-ranks.
 */
export function repin(state: PinState, selected: readonly string[]): PinState {
  return samePinned(state.pinned, selected) ? state : { ...state, pinned: selected }
}

/** Notes where the pointer or focus is. Once both are outside, the pinned set follows the selection. */
export function setEngaged(
  state: PinState,
  where: 'focus' | 'pointer',
  inside: boolean,
  selected: readonly string[],
): PinState {
  const next = { ...state, [where]: inside }

  return isEngaged(next) ? next : repin(next, selected)
}
