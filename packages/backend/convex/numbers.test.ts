import { expect, test } from 'bun:test'

import { formatNumber, formatPercent, formatPrice, relativeChange } from './numbers'

test('numeric precision keeps small values useful, familiar money tidy, and integer counts intact', () => {
  for (const [source, expected] of [
    ['1.4', '$1.40'],
    ['0.2', '$0.20'],
    ['0.022', '$0.022'],
    ['0.016156', '$0.0162'],
    ['0.000396', '$0.000396'],
    ['0.000198', '$0.000198'],
    ['0.004455', '$0.00446'],
    ['0.3317', '$0.332'],
    ['0.2888', '$0.289'],
    ['0.141953', '$0.142'],
    ['0.399625', '$0.40'],
    ['0.016156161561615616156161561615616156', '$0.0162'],
    ['1.005', '$1.01'],
    ['9.999', '$10.00'],
    ['-1.005', '$-1.01'],
    ['0', '$0.00'],
    ['-0', '$0.00'],
  ] as const) {
    expect(formatPrice(source)).toBe(expected)
  }

  expect(formatPrice('0.000000016156', 6)).toBe('$0.0162')
  expect(formatPrice('1.6156e-8', 6)).toBe('$0.0162')
  expect(formatNumber(128_001)).toBe('128,001')
  expect(formatNumber('9007199254740993')).toBe('9,007,199,254,740,993')
  expect(formatNumber(0.141953)).toBe('0.142')
  expect(formatNumber(-0.000198)).toBe('-0.000198')
  expect(formatNumber(Number.MIN_VALUE)).not.toBe('0')
  expect(formatPercent(0.423)).toBe('42.3%')
  expect(formatPercent(0.00000198)).toBe('0.000198%')

  for (const invalid of [
    '',
    ' ',
    'not a number',
    'Infinity',
    'NaN',
    '1e1000000',
    '1'.repeat(101),
  ]) {
    expect(formatNumber(invalid)).toBeNull()
    expect(relativeChange('1', invalid)).toBeNull()
  }
  expect(formatNumber(Number.POSITIVE_INFINITY)).toBeNull()
})

test('relative changes use original decimals and never round real movement to zero', () => {
  for (const [before, after, isUp, percent] of [
    ['0.141953', '0.142', true, '0.033%'],
    ['0.399625', '0.4', true, '0.094%'],
    ['0.0359375', '0.036', true, '0.17%'],
    ['0.000396', '0.000198', false, '50%'],
    ['0.0002', '0.0378', true, '18,800%'],
    ['0.3249', '1.4', true, '330.9%'],
    ['0.016156', '0.01708', true, '5.7%'],
    ['100000', '100001', true, '0.001%'],
    ['1000000', '1000001', true, '<0.001%'],
    ['1.0000000000000000001', '1', false, '<0.001%'],
    ['1e-300', '2e-300', true, '100%'],
    ['-100', '-99', true, '1%'],
    ['1', '0', false, '100%'],
  ] as const) {
    expect(relativeChange(before, after)).toEqual({ isUp, percent })
  }

  expect(relativeChange(0.141953, 0.142)).toEqual(relativeChange('0.141953', '0.142'))
  expect(relativeChange(0, 1)).toBeNull()
  expect(relativeChange(1, 1)).toBeNull()
  expect(relativeChange('1.00', '1')).toBeNull()

  for (const [after, percent] of [
    ['100.0000001', ''],
    ['100.49999', ''],
    ['100.5', '1%'],
    ['108.49', '8%'],
    ['108.5', '9%'],
  ] as const) {
    expect(relativeChange('100', after, { fractionDigits: 0 })).toEqual({ isUp: true, percent })
  }
})
