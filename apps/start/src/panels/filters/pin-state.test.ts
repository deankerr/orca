import { describe, expect, it } from 'vitest'

import {
  expectSelection,
  isEngaged,
  observeSelection,
  repin,
  setEngaged,
  startPin,
  tickSelection,
} from './pin-state'

describe('pin state', () => {
  it('starts pinned to the selection, with nothing engaged', () => {
    const state = startPin(['a'])

    expect(state.pinned).toEqual(['a'])
    expect(isEngaged(state)).toBe(false)
  })

  it('keeps the pinned set when the selection changes by a tick of its own', () => {
    let state = setEngaged(startPin(['a']), 'pointer', true, ['a'])

    state = expectSelection(state, ['a', 'b'])
    state = observeSelection(state, ['a', 'b'])

    expect(state.pinned).toEqual(['a'])
    expect(state.own).toEqual([])
  })

  it('keeps it through several ticks in a row, even if the URL lags', () => {
    let state = setEngaged(startPin([]), 'focus', true, [])

    state = expectSelection(state, ['a'])
    state = expectSelection(state, [])
    state = observeSelection(state, ['a'])
    state = observeSelection(state, [])

    expect(state.pinned).toEqual([])
    expect(state.own).toEqual([])
  })

  it('pins a tick whose update lands after the user has left the facet', () => {
    let state = setEngaged(startPin([]), 'pointer', true, [])

    state = setEngaged(setEngaged(state, 'focus', true, []), 'focus', false, [])
    state = expectSelection(state, ['a'])
    state = setEngaged(state, 'pointer', false, [])

    // Both have left before the URL answers, so the leave repinned to the old selection.
    expect(state.pinned).toEqual([])

    state = observeSelection(state, ['a'])

    expect(state.pinned).toEqual(['a'])
    expect(state.own).toEqual([])
  })

  it('repins when the selection changes from outside', () => {
    const state = observeSelection(setEngaged(startPin(['a']), 'pointer', true, ['a']), ['c'])

    expect(state.pinned).toEqual(['c'])
  })

  it('repins to a selection that differs from the facet own ticks', () => {
    let state = expectSelection(startPin([]), ['a'])

    state = observeSelection(state, ['b'])

    expect(state.pinned).toEqual(['b'])
    expect(state.own).toEqual([])
  })

  it('ignores a re-render with the same selection, in any order', () => {
    const state = startPin(['a', 'b'])

    expect(observeSelection(state, ['b', 'a'])).toBe(state)
  })

  it('repins only once the pointer and focus have both left', () => {
    let state = startPin(['a'])

    state = setEngaged(state, 'pointer', true, ['a'])
    state = setEngaged(state, 'focus', true, ['a'])
    state = setEngaged(state, 'pointer', false, ['a', 'b'])

    expect(state.pinned).toEqual(['a'])

    state = setEngaged(state, 'focus', false, ['a', 'b'])

    expect(state.pinned).toEqual(['a', 'b'])
    expect(isEngaged(state)).toBe(false)
  })

  it('repins when the filter text changes', () => {
    expect(repin(startPin(['a']), ['a', 'b']).pinned).toEqual(['a', 'b'])
  })

  it('keeps the pinned array when the pointer and focus leave with the selection unchanged', () => {
    const start = startPin(['a', 'b'])
    const engaged = setEngaged(start, 'focus', true, ['a', 'b'])
    const left = setEngaged(engaged, 'focus', false, ['b', 'a'])

    expect(left.pinned).toBe(start.pinned)
    expect(repin(left, ['a', 'b'])).toBe(left)
  })

  it('keeps the pinned array when an outside change returns the same ids', () => {
    const start = startPin(['a'])
    const state = observeSelection({ ...start, seen: ['c'] }, ['a'])

    expect(state.pinned).toBe(start.pinned)
    expect(state.seen).toEqual(['a'])
  })

  describe('ticking through the toggle logic', () => {
    /** The facet is under the pointer; ticks go through `tickSelection`, as `ListFacet` does. */
    const engaged = (selected: readonly string[]) =>
      setEngaged(startPin(selected), 'pointer', true, selected)

    it('keeps the pinned set through ticks made before the URL answers', () => {
      let state = engaged([])

      state = tickSelection(state, 'a')
      state = tickSelection(state, 'b')

      // The URL toggles each value on the selection it holds, so it answers [a], then [a, b].
      state = observeSelection(state, ['a'])
      state = observeSelection(state, ['a', 'b'])

      expect(state.pinned).toEqual([])
      expect(state.own).toEqual([])
    })

    it('keeps it when the URL skips straight to the last selection', () => {
      let state = engaged([])

      state = tickSelection(tickSelection(state, 'a'), 'b')
      state = observeSelection(state, ['a', 'b'])

      expect(state.pinned).toEqual([])
      expect(state.own).toEqual([])
    })

    it('expects an untick of a pending tick', () => {
      let state = engaged([])

      state = tickSelection(tickSelection(state, 'a'), 'a')
      state = observeSelection(state, ['a'])
      state = observeSelection(state, [])

      expect(state.pinned).toEqual([])
      expect(state.own).toEqual([])
    })

    it('ticks from the observed selection once nothing is pending', () => {
      let state = engaged(['a'])

      state = observeSelection(tickSelection(state, 'b'), ['a', 'b'])
      state = observeSelection(tickSelection(state, 'a'), ['b'])

      expect(state.pinned).toEqual(['a'])
      expect(state.own).toEqual([])
    })

    it('still repins on a change that is not a pending tick', () => {
      const state = observeSelection(tickSelection(engaged([]), 'a'), ['c'])

      expect(state.pinned).toEqual(['c'])
    })
  })
})
