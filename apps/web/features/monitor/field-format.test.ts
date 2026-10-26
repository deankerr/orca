import type { AlertChange } from '@orca/backend/alerts/curate'
import { expect, test } from 'vitest'

import { presentChange } from '@/lib/backend'

import { fieldLabel, formatChangeUnit, formatChangeValue } from './field-format'

const movement = (change: AlertChange) => {
  const presented = presentChange(change)

  return presented.transition === 'updated' ? presented.movement : null
}

const input = (value: string | null) => ({ field: 'pricing.input', kind: 'price' as const, value })

test('Monitor formats native decimal prices and distinguishes null, false and zero', () => {
  expect(formatChangeValue(input('0.0000001'))).toBe('$0.10')
  expect(formatChangeValue(input('0.00000015'))).toBe('$0.15')

  expect(
    movement({
      after: '0.00000015',
      before: '0.0000001',
      field: 'pricing.input',
      kind: 'price',
    }),
  ).toEqual({ isFavorable: false, isUp: true, percent: '50%' })

  expect(formatChangeValue(input('1e-400'))).not.toBe('$0.00')
  expect(
    formatChangeUnit({ field: 'pricing.input_cache_write_1h', kind: 'price', value: '0.000001' }),
  ).toBe('MTOK')
  expect(formatChangeUnit(input(null))).toBe('')
  expect(fieldLabel('pricing.input_cache_write_1h')).toBe('cache_write_1h')
  expect(formatChangeValue({ field: 'pricing.discount', kind: 'percent', value: 0.15 })).toBe('15%')

  // Discounts are fractions, and an unquoted price is not a zero-price quote.
  expect(
    movement({ after: 0.15, before: 0.1, field: 'pricing.discount', kind: 'percent' }),
  ).toBeNull()
  expect(movement({ after: '1', before: null, field: 'pricing.input', kind: 'price' })).toBeNull()

  expect(
    [
      { field: 'quantization', kind: 'text' as const, value: null },
      { field: 'is_disabled', kind: 'flag' as const, value: false },
      { field: 'limit_rpm', kind: 'count' as const, value: 0 },
    ].map(formatChangeValue),
  ).toEqual(['null', 'false', '0'])
})
