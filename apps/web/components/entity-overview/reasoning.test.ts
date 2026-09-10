import { expect, test } from 'bun:test'

import { reasoningLabel, orderEfforts } from './reasoning'

test('reasoning preserves unknown requirements and orders familiar efforts', () => {
  expect(reasoningLabel(true, null)).toBe('Supported')
  expect(reasoningLabel(null, false)).toBeNull()
  expect(reasoningLabel(true, false)).toBe('Optional')
  expect(reasoningLabel(true, true)).toBe('Required')
  expect(reasoningLabel(false, null)).toBe('Unsupported')
  expect(orderEfforts(['high', 'low', 'max', 'custom'])).toEqual(['low', 'high', 'max', 'custom'])
  expect(orderEfforts(null)).toBeNull()
})
