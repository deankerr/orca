import { describe, expect, it } from 'vitest'

import {
  expectSelection,
  isEngaged,
  observeSelection,
  repin,
  setEngaged,
  startPin,
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
})
