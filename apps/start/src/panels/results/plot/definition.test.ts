import { describe, expect, it } from 'vitest'

import { TICK_LABEL_CHAR_WIDTH, Y_TICK_LABEL_DX, yTickLabelsClearance } from './definition'

describe('yTickLabelsClearance', () => {
  it('starts the corner caption past the widest y tick label, with a gap', () => {
    // `1,000` is five characters, drawn from `Y_TICK_LABEL_DX`.
    const labelEnd = Y_TICK_LABEL_DX + 5 * TICK_LABEL_CHAR_WIDTH

    expect(yTickLabelsClearance([10, 100, 1000])).toBeGreaterThan(labelEnd)
    expect(yTickLabelsClearance([10, 100])).toBeLessThan(yTickLabelsClearance([10, 100, 1000]))
  })
})
