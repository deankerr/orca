import { expect, test } from 'bun:test'

import { fieldLabel, formatChangeDelta, formatChangeUnit, formatChangeValue } from './field-format'

test('Monitor formats native decimal prices and distinguishes null, false and zero', () => {
  expect(formatChangeValue('0.0000001', 'pricing.prompt')).toBe('$0.10')
  expect(formatChangeValue('0.00000015', 'pricing.prompt')).toBe('$0.15')

  expect(formatChangeDelta('0.0000001', '0.00000015', 'pricing.prompt')).toEqual({
    isUp: true,
    percent: '50%',
    isGood: false,
  })

  expect(formatChangeValue('1e-400', 'pricing.prompt')).not.toBe('$0.00')
  expect(formatChangeUnit('pricing.input_cache_write_1h', '0.000001')).toBe('MTOK')
  expect(formatChangeUnit('pricing.prompt', null)).toBe('')
  expect(formatChangeUnit('pricing.prompt', 'invalid')).toBe('')
  expect(fieldLabel('pricing.input_cache_write_1h')).toBe('cache_write_1h')
  expect(formatChangeValue(0.15, 'pricing.discount')).toBe('15%')
  expect(formatChangeDelta(0.1, 0.15, 'pricing.discount')).toBeNull()
  expect(formatChangeDelta('', '1', 'pricing.prompt')).toBeNull()

  expect([null, false, 0].map((value) => formatChangeValue(value, 'field'))).toEqual([
    'null',
    'false',
    '0',
  ])
})
