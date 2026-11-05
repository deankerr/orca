import { describe, expect, it } from 'vitest'

import { filterKeyAction } from './filter-keys'

const press = (key: string, isComposing = false) => ({ isComposing, key })

describe('filterKeyAction', () => {
  it('clears a filled field on Esc and toggles the first match on Enter', () => {
    expect(filterKeyAction(press('Escape'), 'kimi')).toBe('clear')
    expect(filterKeyAction(press('Enter'), 'kimi')).toBe('toggle-first')
  })

  it('leaves Esc and Enter alone in an empty or blank field as appropriate', () => {
    expect(filterKeyAction(press('Escape'), '')).toBeUndefined()
    expect(filterKeyAction(press('Enter'), '')).toBeUndefined()
    expect(filterKeyAction(press('Enter'), '  ')).toBeUndefined()
    expect(filterKeyAction(press('Escape'), '  ')).toBe('clear')
  })

  it('does nothing while an input method is composing', () => {
    expect(filterKeyAction(press('Escape', true), 'ki')).toBeUndefined()
    expect(filterKeyAction(press('Enter', true), 'ki')).toBeUndefined()
  })

  it('ignores other keys', () => {
    expect(filterKeyAction(press('a'), 'k')).toBeUndefined()
  })
})
