import { beforeAll, describe, expect, it, vi } from 'vitest'

import { RESULTS_REGION_ID, returnFocusToTable } from './focus'

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
