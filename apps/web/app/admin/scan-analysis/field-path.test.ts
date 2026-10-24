import { expect, test } from 'vitest'

import { readablePath } from './field-path'

test('profile paths read as dotted keys with array markers and an emphasized leaf', () => {
  expect(readablePath('$[*]["id"]')).toEqual({ leaf: 'id', parent: '' })
  expect(readablePath('$[*]["pricing"]["display_pricing"][*]["scheduleWindows"][*]')).toEqual({
    leaf: '[]',
    parent: 'pricing.display_pricing[].scheduleWindows',
  })
  expect(readablePath('$[*]["pricing"][*]["utc_end"]')).toEqual({
    leaf: '.utc_end',
    parent: 'pricing[]',
  })
})

test('keys that are not identifiers keep their quoted form', () => {
  expect(readablePath('$[*]["a.b"]["x-y"]["[*]"]')).toEqual({
    leaf: '["[*]"]',
    parent: '["a.b"]["x-y"]',
  })
  expect(readablePath('$[*]["say \\"hi\\""]')).toEqual({ leaf: '["say \\"hi\\""]', parent: '' })
})
