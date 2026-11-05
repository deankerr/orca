import { describe, expect, it } from 'vitest'

import { rowWith } from './fixtures.testing'
import { formatMeterRate, formatOverrideRates, pricingRows } from './pricing'

const pricingOf = (pricing: Parameters<typeof rowWith>[0] = {}) => rowWith(pricing).endpoint.pricing

const NATIVE = { nativeWebSearch: true }
const NOT_NATIVE = { nativeWebSearch: false }

/** Pricing rows for an endpoint with native web search, unless a test says otherwise. */
const rowsOf = (pricing: Parameters<typeof pricingRows>[0], context = NATIVE) =>
  pricingRows(pricing, context)

const values = (rows: { id: string; value: string }[]) =>
  Object.fromEntries(rows.map(({ id, value }) => [id, value]))

describe('formatMeterRate', () => {
  it('prices token meters per million tokens', () => {
    expect(formatMeterRate('0.0000025', 'prompt')).toBe('$2.50')
    expect(formatMeterRate('0.000000125', 'input_cache_read')).toBe('$0.125')
  })

  it('prices web search per request', () => {
    expect(formatMeterRate('0.01', 'web_search')).toBe('$0.01 /req')
  })

  it('shows zero as $0, not a rounded amount', () => {
    expect(formatMeterRate('0', 'prompt')).toBe('$0')
    expect(formatMeterRate('0', 'web_search')).toBe('$0 /req')
  })

  it('has no text for a malformed rate', () => {
    expect(formatMeterRate('free', 'prompt')).toBeNull()
  })
})

describe('pricingRows', () => {
  it('lists each quoted meter in display order and skips unquoted ones', () => {
    const rows = rowsOf(
      pricingOf({
        pricing: {
          input: '0.0000001',
          input_cache_read: '0.00000001',
          input_cache_write: '0.000000125',
          input_cache_write_1h: '0.0000002',
          output: '0.0000005',
          web_search: '0.01',
        },
      }),
    )

    expect(rows.map(({ id }) => id)).toEqual([
      'prompt',
      'completion',
      'input_cache_read',
      'input_cache_write',
      'input_cache_write_1h',
      'web_search',
    ])
    expect(values(rows)).toMatchObject({
      completion: '$0.50',
      input_cache_read: '$0.01',
      input_cache_write: '$0.125',
      input_cache_write_1h: '$0.20',
      prompt: '$0.10',
      web_search: '$0.01 /req',
    })
  })

  it('shows the web search price only where the provider searches natively', () => {
    const quoted = pricingOf({ pricing: { web_search: '0.01' } })

    expect(rowsOf(quoted, NATIVE).map(({ id }) => id)).toContain('web_search')
    expect(rowsOf(quoted, NOT_NATIVE).map(({ id }) => id)).not.toContain('web_search')
  })

  it('marks every price so it never breaks across lines', () => {
    const rows = rowsOf(
      pricingOf({
        pricing: {
          discount: 0.1,
          input: '0.000001',
          output: '0.000002',
          overrides: [
            {
              completion: '0.000002',
              input_cache_read: '0.0000001',
              prompt: '0.000001',
              utc_end: 1600,
              utc_start: 800,
            },
          ],
        },
      }),
    )

    expect(rows.filter(({ rate }) => rate !== true)).toEqual([])
  })

  it('shows a free endpoint as $0', () => {
    const rows = rowsOf(pricingOf({ pricing: { input: '0', output: '0' } }))

    expect(values(rows)).toMatchObject({ completion: '$0', prompt: '$0' })
  })

  it('includes image and audio meters when quoted', () => {
    const rows = rowsOf(pricingOf({ pricing: { audio: '0.000001', image: '0.000002' } }))

    expect(values(rows)).toMatchObject({ audio: '$1.00', image: '$2.00' })
  })

  it('shows a positive discount, but not zero or a surcharge', () => {
    expect(values(rowsOf(pricingOf({ pricing: { discount: 0.1 } })))).toMatchObject({
      discount: '10% off',
    })
    expect(rowsOf(pricingOf({ pricing: { discount: 0 } })).map(({ id }) => id)).not.toContain(
      'discount',
    )
    expect(rowsOf(pricingOf({ pricing: { discount: -0.1 } })).map(({ id }) => id)).not.toContain(
      'discount',
    )
  })

  it('shows long-context prices as a row after the plain rates', () => {
    const rows = rowsOf(
      pricingOf({
        pricing: {
          overrides: [{ completion: '0.0000025', min_prompt_tokens: 100_000, prompt: '0.0000005' }],
        },
      }),
    )

    expect(rows.at(-1)).toMatchObject({
      emphasis: true,
      label: 'Over 100K prompt tokens',
      value: '$0.50 / $2.50',
    })
  })

  it('shows each prompt-length bracket with the rates in force there', () => {
    const rows = rowsOf(
      pricingOf({
        pricing: {
          overrides: [
            { min_prompt_tokens: 200_000, prompt: '0.000004' },
            { completion: '0.00002', min_prompt_tokens: 400_000 },
          ],
        },
      }),
    )

    const labels = rows.filter(({ id }) => id.startsWith('over-'))

    expect(labels.map(({ label }) => label)).toEqual([
      'Over 200K prompt tokens',
      'Over 400K prompt tokens',
    ])
    expect(labels[0]?.value).toBe('input $4.00')
    expect(labels[1]?.value).toBe('$4.00 / $20.00')
  })

  it('describes a schedule by its UTC window', () => {
    const rows = rowsOf(
      pricingOf({
        pricing: {
          overrides: [
            { completion: '0.000002', prompt: '0.000001', utc_end: 1600, utc_start: 800 },
          ],
        },
      }),
    )

    expect(rows.at(-1)).toMatchObject({ label: '08:00–16:00 UTC', value: '$1.00 / $2.00' })
  })

  it('counts override rows it cannot read', () => {
    const rows = rowsOf(pricingOf({ pricing: { overrides: [{ surprise: 'yes' }] } }))

    expect(rows.at(-1)).toMatchObject({ label: 'Other conditions', value: '1 unread' })
  })
})

describe('pricing overrides with further meters', () => {
  it('sets cache and audio rates under the input and output headline', () => {
    const rows = rowsOf(
      pricingOf({
        pricing: {
          overrides: [
            {
              completion: '0.0000075',
              input_cache_read: '0.000000125',
              min_prompt_tokens: 200_000,
              prompt: '0.00000125',
            },
          ],
        },
      }),
    )

    expect(rows.slice(-2)).toMatchObject([
      { label: 'Over 200K prompt tokens', value: '$1.25 / $7.50' },
      { indent: true, label: 'cache read', value: '$0.125' },
    ])
  })
})

describe('formatOverrideRates', () => {
  it('leaves input and output bare when both are restated', () => {
    expect(formatOverrideRates({ completion: '0.00001', prompt: '0.000002' })).toBe(
      '$2.00 / $10.00',
    )
  })

  it('names a meter that stands alone', () => {
    expect(formatOverrideRates({ input_cache_read: '0.0000002' })).toBe('cache read $0.20')
  })
})
