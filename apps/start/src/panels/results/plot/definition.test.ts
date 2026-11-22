import { describe, expect, it } from 'vitest'

import {
  formatPriceTick,
  plotDefinition,
  TICK_LABEL_CHAR_WIDTH,
  Y_TICK_LABEL_DX,
  yTickLabelsClearance,
} from './definition'

describe('yTickLabelsClearance', () => {
  it('starts the corner caption past the widest y tick label, with a gap', () => {
    // `1,000` is five characters, drawn from `Y_TICK_LABEL_DX`.
    const labelEnd = Y_TICK_LABEL_DX + 5 * TICK_LABEL_CHAR_WIDTH

    expect(yTickLabelsClearance([10, 100, 1000])).toBeGreaterThan(labelEnd)
    expect(yTickLabelsClearance([10, 100])).toBeLessThan(yTickLabelsClearance([10, 100, 1000]))
  })
})

describe('formatPriceTick', () => {
  it.each([
    [0.001, '$0.001'],
    [0.005, '$0.005'],
    [0.01, '$0.01'],
    [0.02, '$0.02'],
    [0.1, '$0.10'],
    [0.5, '$0.50'],
    [1, '$1'],
    [10, '$10'],
    [100, '$100'],
    [200, '$200'],
    [1000, '$1,000'],
    [0.0005, '$0.0005'],
  ])('labels %d as %s', (price, text) => {
    expect(formatPriceTick(price)).toBe(text)
  })
})

describe('plotDefinition', () => {
  const point = (id: string, noCache: boolean) => ({ id, noCache, price: 1, throughput: 100 })

  const definition = plotDefinition({
    inScope: [point('in-filled', false), point('in-ring', true)],
    outOfScope: [point('out-filled', false), point('out-ring', true)],
    priceDomain: [0.005, 50],
    throughputDomain: [10, 1000],
  })

  it('draws a filled dot layer and a ring layer inside the filters and outside them', () => {
    expect(definition.marks).toHaveLength(4)
  })
})
