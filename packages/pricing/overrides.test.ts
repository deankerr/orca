import { describe, expect, it } from 'vitest'

import { conditionalPricing, isLongContextPriced, isSchedulePriced } from './index'

describe('prompt-length brackets', () => {
  it('orders brackets and lets later rows win per key across lower thresholds', () => {
    const { brackets } = conditionalPricing([
      { completion: '4', min_prompt_tokens: 256_000, prompt: '3' },
      { input_cache_read: '1', min_prompt_tokens: 32_000, prompt: '2' },
    ])

    expect(brackets).toEqual([
      { above_prompt_tokens: 32_000, rates: { input_cache_read: '1', prompt: '2' } },
      {
        above_prompt_tokens: 256_000,
        rates: { completion: '4', input_cache_read: '1', prompt: '2' },
      },
    ])
  })
})

describe('schedule bands', () => {
  it('merges repeated rates into one band and keeps each window', () => {
    const cheap = { prompt: '1' }
    const weekdays = ['monday', 'tuesday']

    const { bands, unrecognized } = conditionalPricing([
      { ...cheap, utc_days: ['saturday', 'sunday'] },
      { ...cheap, utc_days: weekdays, utc_end: 100, utc_start: 0 },
      { prompt: '2', utc_days: weekdays, utc_end: 400, utc_start: 100 },
      { ...cheap, utc_days: weekdays, utc_end: 0, utc_start: 400 },
    ])

    expect(unrecognized).toEqual([])
    expect(bands).toEqual([
      {
        rates: cheap,
        windows: [
          { days: ['saturday', 'sunday'], end: null, start: null },
          { days: weekdays, end: 100, start: 0 },
          { days: weekdays, end: 0, start: 400 },
        ],
      },
      { rates: { prompt: '2' }, windows: [{ days: weekdays, end: 400, start: 100 }] },
    ])
  })

  it('reads a daily window without days', () => {
    expect(conditionalPricing([{ prompt: '1', utc_end: 0, utc_start: 1400 }]).bands).toEqual([
      { rates: { prompt: '1' }, windows: [{ days: null, end: 0, start: 1400 }] },
    ])
  })
})

describe('rows it cannot read', () => {
  it.each([
    ['a new condition', { min_image_tokens: 5, prompt: '1' }],
    ['combined conditions', { min_prompt_tokens: 5, prompt: '1', utc_end: 1, utc_start: 0 }],
    ['half a window', { prompt: '1', utc_start: 100 }],
    ['malformed days', { prompt: '1', utc_days: [] }],
    ['a string threshold', { min_prompt_tokens: '5x', prompt: '1' }],
    ['no condition', { prompt: '1' }],
  ])('keeps %s as sent', (_name, row) => {
    expect(conditionalPricing([row])).toEqual({ bands: [], brackets: [], unrecognized: [row] })
  })

  it('still reads the other rows', () => {
    const unknown = { min_image_tokens: 5, prompt: '1' }
    const bracket = { min_prompt_tokens: 5, prompt: '2' }

    expect(conditionalPricing([unknown, bracket])).toMatchObject({
      brackets: [{ above_prompt_tokens: 5 }],
      unrecognized: [unknown],
    })
  })

  it('carries a new price key instead of dropping it', () => {
    const rates = conditionalPricing([{ min_prompt_tokens: 5, video: '1' }]).brackets[0]?.rates

    expect(rates).toEqual({ video: '1' })
  })
})

describe('condition checks', () => {
  it('sees conditions on rows that cannot be read', () => {
    expect(isSchedulePriced([{ prompt: '1', utc_new: 1 }])).toBe(true)
    expect(isLongContextPriced([{ min_prompt_tokens: 'x' }])).toBe(true)
  })

  it('treats missing overrides as unconditional', () => {
    expect(isSchedulePriced(undefined)).toBe(false)
    expect(isLongContextPriced(null)).toBe(false)
  })
})
