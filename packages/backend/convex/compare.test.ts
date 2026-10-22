import { expect, test } from 'bun:test'

import { Operation } from 'json-diff-ts'

import { compare } from './compare'
import type { JsonValue } from './json'

test('string arrays use value identity at known, new, and nested paths', () => {
  // oxlint-disable sort-keys -- Key order determines the order of diff changes asserted below.
  const previous = {
    entity: {
      supported_parameters: ['temperature', 'top_logprobs'],
      new_field: [],
      groups: [{ labels: ['old'] }],
    },
  }
  const next = {
    entity: {
      supported_parameters: ['temperature', 'tools', 'top_logprobs'],
      new_field: ['new'],
      groups: [{ labels: ['new'] }],
    },
  }
  // oxlint-enable sort-keys

  expect(compare(previous, next)).toMatchObject([
    {
      changes: [
        {
          changes: [{ key: 'tools', type: 'ADD', value: 'tools' }],
          embeddedKey: '$value',
          key: 'supported_parameters',
        },
        {
          changes: [{ key: 'new', type: 'ADD', value: 'new' }],
          embeddedKey: '$value',
          key: 'new_field',
        },
        {
          changes: [
            {
              changes: [
                {
                  changes: [
                    { key: 'new', type: 'ADD', value: 'new' },
                    { key: 'old', type: 'REMOVE', value: 'old' },
                  ],
                  embeddedKey: '$value',
                  key: 'labels',
                },
              ],
              key: '0',
            },
          ],
          embeddedKey: '$index',
          key: 'groups',
        },
      ],
      key: 'entity',
      type: 'UPDATE',
    },
  ])
  expect(compare(next, previous)[0]?.changes?.[1]).toMatchObject({
    changes: [{ key: 'new', type: 'REMOVE', value: 'new' }],
    embeddedKey: '$value',
    key: 'new_field',
  })
})

test('string-array duplicate counts are intentionally unobserved', () => {
  expect(compare({ labels: ['tools'] }, { labels: ['tools', 'tools'] })).toEqual([])
  expect(compare({ labels: ['tools', 'tools'] }, { labels: ['tools', 'new'] })).toMatchObject([
    { changes: [{ key: 'new', type: 'ADD', value: 'new' }], embeddedKey: '$value' },
  ])
})

test('null is a real value in both directions for string and numeric fields', () => {
  for (const value of ['bf16', 10]) {
    expect(compare({ field: value }, { field: null })).toEqual([
      { key: 'field', oldValue: value, type: Operation.UPDATE, value: null },
    ])
    expect(compare({ field: null }, { field: value })).toEqual([
      { key: 'field', oldValue: null, type: Operation.UPDATE, value },
    ])
  }
})

test('mixed arrays retain index matching in either direction', () => {
  for (const [previous, next] of [
    [['tools'], ['tools', 1]],
    [['tools', 1], ['tools']],
  ]) {
    expect(compare({ values: previous }, { values: next })[0]?.embeddedKey).toBe('$index')
  }
})

test('object type transitions retain complete before and after values', () => {
  const objects: JsonValue[] = [{}, { enabled: true }]

  for (const previous of objects) {
    for (const next of [false, 'none', [], null, 10]) {
      expect(compare({ config: previous }, { config: next })).toEqual([
        { key: 'config', oldValue: previous, type: Operation.UPDATE, value: next },
      ])
      expect(compare({ config: next }, { config: previous })).toEqual([
        { key: 'config', oldValue: next, type: Operation.UPDATE, value: previous },
      ])
    }
  }
})
