import { defaultWorkload, workloadPresets } from '@orca/pricing'
import { describe, expect, it } from 'vitest'

import { MAX_RATIO } from '#endpoints/scope'

import {
  costHint,
  formatRatio,
  hitPercent,
  parseHitPercent,
  parseRatio,
  workloadButtonName,
  workloadDescription,
  workloadNumbers,
} from './workload'

const custom = { hitRate: 0.85, ratio: 40 }

describe('formatRatio', () => {
  it.each([
    [100, '100'],
    [2.5, '2.5'],
    [1000, '1000'],
    [33.333, '33.3'],
    [0.5, '0.5'],
  ])('shows a ratio of %d as %s', (ratio, text) => {
    expect(formatRatio(ratio)).toBe(text)
  })
})

describe('hitPercent', () => {
  it('is the hit rate as a whole percent', () => {
    expect(hitPercent(defaultWorkload)).toBe(90)
    expect(hitPercent({ hitRate: 0.07, ratio: 1 })).toBe(7)
    expect(hitPercent({ hitRate: 0, ratio: 1 })).toBe(0)
  })
})

describe('workloadNumbers', () => {
  it('shows the numbers of a preset, never its label', () => {
    expect(workloadNumbers(defaultWorkload)).toBe('100:1 · 90%')

    for (const preset of workloadPresets) {
      expect(workloadNumbers(preset.workload)).not.toContain(preset.label)
    }
  })

  it('shows the numbers of any other', () => {
    expect(workloadNumbers(custom)).toBe('40:1 · 85%')
    expect(workloadNumbers({ hitRate: 0.9, ratio: 99 })).toBe('99:1 · 90%')
    expect(workloadNumbers({ hitRate: 0, ratio: 2.5 })).toBe('2.5:1 · 0%')
    expect(workloadNumbers({ hitRate: 1, ratio: 1000 })).toBe('1000:1 · 100%')
  })
})

describe('workloadButtonName', () => {
  it('spells out the ratio and the hit rate, without a preset name', () => {
    expect(workloadButtonName(defaultWorkload)).toBe(
      'Workload: 100 to 1 input to output, 90% cache hits',
    )
    expect(workloadButtonName(custom)).toBe('Workload: 40 to 1 input to output, 85% cache hits')
  })
})

describe('workloadDescription', () => {
  it('says how many input tokens per output token, and how many are read from cache', () => {
    expect(workloadDescription(defaultWorkload)).toBe(
      '100 input tokens per output token, 90% read from cache',
    )
  })

  it('says caching is off at a hit rate of 0', () => {
    expect(workloadDescription({ hitRate: 0, ratio: 3 })).toBe(
      '3 input tokens per output token, caching off',
    )
  })

  it('uses the singular for a ratio of 1', () => {
    expect(workloadDescription({ hitRate: 0.5, ratio: 1 })).toBe(
      '1 input token per output token, 50% read from cache',
    )
  })
})

describe('costHint', () => {
  it('tells the Cost header what its figures are', () => {
    expect(costHint(defaultWorkload)).toBe(
      'Cost per million tokens for this workload: 100 input tokens per output token, 90% read from cache',
    )
  })
})

describe('parseRatio', () => {
  it.each([
    ['100', 100],
    ['2.5', 2.5],
    ['0.5', 0.5],
    ['.5', 0.5],
    ['2.', 2],
    [' 7 ', 7],
    ['007', 7],
    [String(MAX_RATIO), MAX_RATIO],
    ['0.001', 0.001],
  ])('reads %j as %d', (text, ratio) => {
    expect(parseRatio(text)).toBe(ratio)
  })

  it.each([
    [''],
    [' '],
    ['.'],
    ['0'],
    ['0.0'],
    ['-3'],
    ['abc'],
    ['1e2'],
    ['1,5'],
    ['2.5.1'],
    ['Infinity'],
    [String(MAX_RATIO + 1)],
    ['1000.01'],
  ])('rejects %j', (text) => {
    expect(parseRatio(text)).toBeNull()
  })
})

describe('parseHitPercent', () => {
  it.each([
    ['0', 0],
    ['85', 85],
    ['100', 100],
    ['007', 7],
    [' 90 ', 90],
  ])('reads %j as %d', (text, percent) => {
    expect(parseHitPercent(text)).toBe(percent)
  })

  it.each([[''], ['101'], ['1000'], ['-1'], ['7.5'], ['9 0'], ['abc'], ['90%']])(
    'rejects %j',
    (text) => {
      expect(parseHitPercent(text)).toBeNull()
    },
  )
})
