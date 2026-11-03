import { beforeAll, describe, expect, it, vi } from 'vitest'

import {
  KEYS_RESERVED_ATTRIBUTE,
  RESULTS_REGION_ID,
  TABLE_KEYS_ATTRIBUTE,
  panelClosesOnEscape,
  returnFocusFromPanel,
  returnFocusToTable,
  tableOwnsKeys,
} from './keyboard'
import type { FocusProbe } from './keyboard'

const body: FocusProbe = { closest: () => null }

/** An element that sits inside a region with the given attribute, or inside none. */
function insideRegion(...attributes: string[]): FocusProbe {
  return {
    closest: (selector) =>
      attributes.some((attribute) => selector === `[${attribute}]`) ? {} : null,
  }
}

describe('tableOwnsKeys', () => {
  it('owns the keys when nothing has focus', () => {
    expect(tableOwnsKeys(null, body)).toBe(true)
    expect(tableOwnsKeys(body, body)).toBe(true)
  })

  it('owns the keys inside a marked region', () => {
    expect(tableOwnsKeys(insideRegion(TABLE_KEYS_ATTRIBUTE), body)).toBe(true)
  })

  it('leaves the keys to a reserved widget inside a marked region', () => {
    expect(tableOwnsKeys(insideRegion(TABLE_KEYS_ATTRIBUTE, KEYS_RESERVED_ATTRIBUTE), body)).toBe(
      false,
    )
  })

  it('leaves the keys to focus anywhere else', () => {
    expect(tableOwnsKeys(insideRegion(), body)).toBe(false)
    expect(tableOwnsKeys(insideRegion('data-other'), body)).toBe(false)
  })
})

describe('panelClosesOnEscape', () => {
  const press = (key: string, changes: { isComposing?: boolean } = {}) =>
    panelClosesOnEscape({ isComposing: false, key, ...changes })

  it('closes on Esc', () => {
    expect(press('Escape')).toBe(true)
  })

  it('leaves the tab list’s and Table’s other keys alone', () => {
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter']) {
      expect(press(key)).toBe(false)
    }
  })

  it('yields to an input method', () => {
    expect(press('Escape', { isComposing: true })).toBe(false)
  })
})

/** A document with the given selectors present, recording which element took focus. */
function documentWith(present: string[]) {
  const focused: string[] = []

  const query = (selector: string) =>
    present.includes(selector) ? { focus: () => focused.push(selector) } : null

  return { focused, query }
}

describe('returnFocusToTable', () => {
  // Node has no `CSS`; the IDs here need no escaping.
  beforeAll(() => {
    vi.stubGlobal('CSS', { escape: (text: string) => text })
  })

  it('focuses the endpoint’s row when it is in the table', () => {
    const { focused, query } = documentWith(['tr[data-endpoint-id="abc"]', `#${RESULTS_REGION_ID}`])

    expect(returnFocusToTable('abc', query)).toBe('row')
    expect(focused).toEqual(['tr[data-endpoint-id="abc"]'])
  })

  it('falls back to the Results region when the filters dropped the row', () => {
    const { focused, query } = documentWith([`#${RESULTS_REGION_ID}`])

    expect(returnFocusToTable('abc', query)).toBe('region')
    expect(focused).toEqual([`#${RESULTS_REGION_ID}`])
  })

  it('does nothing when neither exists', () => {
    expect(
      returnFocusToTable(
        'abc',
        vi.fn(() => null),
      ),
    ).toBeNull()
  })
})

describe('returnFocusFromPanel', () => {
  beforeAll(() => {
    vi.stubGlobal('CSS', { escape: (text: string) => text })
  })

  const inside = 'inside'
  const outside = 'outside'
  const panel = { contains: (candidate: string | null) => candidate === inside }

  it('returns focus to the row when the panel holds it', () => {
    const { focused, query } = documentWith(['tr[data-endpoint-id="abc"]'])

    expect(returnFocusFromPanel(panel, inside, 'abc', query)).toBe('row')
    expect(focused).toEqual(['tr[data-endpoint-id="abc"]'])
  })

  it('falls back to the Results region when the row is filtered out', () => {
    const { focused, query } = documentWith([`#${RESULTS_REGION_ID}`])

    expect(returnFocusFromPanel(panel, inside, 'abc', query)).toBe('region')
    expect(focused).toEqual([`#${RESULTS_REGION_ID}`])
  })

  it('leaves focus alone when it is outside the panel', () => {
    const { focused, query } = documentWith(['tr[data-endpoint-id="abc"]'])

    expect(returnFocusFromPanel(panel, outside, 'abc', query)).toBeNull()
    expect(focused).toEqual([])
  })

  it('leaves focus alone when nothing has it', () => {
    const { focused, query } = documentWith(['tr[data-endpoint-id="abc"]'])

    expect(returnFocusFromPanel(panel, null, 'abc', query)).toBeNull()
    expect(focused).toEqual([])
  })
})
