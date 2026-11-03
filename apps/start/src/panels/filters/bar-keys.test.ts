import { describe, expect, it } from 'vitest'

import { barKeyAction } from './bar-keys'
import type { BarKeyState } from './bar-keys'

const state = (changes: Partial<BarKeyState> = {}): BarKeyState => ({
  bounded: false,
  count: 4,
  cursor: undefined,
  home: 1,
  hovered: undefined,
  ...changes,
})

describe('barKeyAction', () => {
  it('previews the next bar toward lower or higher values', () => {
    expect(barKeyAction('ArrowLeft', state())).toEqual({ index: 0, kind: 'preview' })
    expect(barKeyAction('ArrowDown', state())).toEqual({ index: 0, kind: 'preview' })
    expect(barKeyAction('ArrowRight', state())).toEqual({ index: 2, kind: 'preview' })
    expect(barKeyAction('ArrowUp', state())).toEqual({ index: 2, kind: 'preview' })
  })

  it('clamps the preview at the ends', () => {
    expect(barKeyAction('ArrowLeft', state({ home: 0 }))).toEqual({ index: 0, kind: 'preview' })
    expect(barKeyAction('ArrowRight', state({ cursor: 3 }))).toEqual({ index: 3, kind: 'preview' })
  })

  it('jumps to the ends', () => {
    expect(barKeyAction('Home', state())).toEqual({ index: 0, kind: 'preview' })
    expect(barKeyAction('End', state())).toEqual({ index: 3, kind: 'preview' })
  })

  it('presses the focused bar on Enter and Space', () => {
    expect(barKeyAction('Enter', state())).toEqual({ index: 1, kind: 'press' })
    expect(barKeyAction(' ', state())).toEqual({ index: 1, kind: 'press' })
  })

  it('moves and presses from the keyboard preview over the tab stop', () => {
    expect(barKeyAction('ArrowRight', state({ cursor: 2 }))).toEqual({ index: 3, kind: 'preview' })
    expect(barKeyAction('Enter', state({ cursor: 2 }))).toEqual({ index: 2, kind: 'press' })
  })

  it('drops a keyboard preview on Esc before clearing the bound', () => {
    expect(barKeyAction('Escape', state({ bounded: true, cursor: 2 }))).toEqual({ kind: 'cancel' })
    expect(barKeyAction('Escape', state({ bounded: true }))).toEqual({ kind: 'clear' })
  })

  it('drops a pointer preview on Esc rather than clearing the bound', () => {
    expect(barKeyAction('Escape', state({ bounded: true, hovered: 3 }))).toEqual({ kind: 'cancel' })
  })

  it('presses the focused bar, not the hovered one', () => {
    expect(barKeyAction('Enter', state({ hovered: 3 }))).toEqual({ index: 1, kind: 'press' })
  })

  it('leaves Esc to the page with no preview and no bound', () => {
    expect(barKeyAction('Escape', state())).toBeUndefined()
  })

  it('leaves other keys to the page', () => {
    expect(barKeyAction('Tab', state())).toBeUndefined()
    expect(barKeyAction('a', state())).toBeUndefined()
  })
})
