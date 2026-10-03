import { expect, test } from 'bun:test'

import { Operation } from 'json-diff-ts'

import { compare } from './compare'

test('string arrays use value identity at known, new, and nested paths', () => {
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

  expect(compare(previous, next)).toMatchObject([
    {
      key: 'entity',
      type: 'UPDATE',
      changes: [
        {
          key: 'supported_parameters',
          embeddedKey: '$value',
          changes: [{ key: 'tools', type: 'ADD', value: 'tools' }],
        },
        {
          key: 'new_field',
          embeddedKey: '$value',
          changes: [{ key: 'new', type: 'ADD', value: 'new' }],
        },
        {
          key: 'groups',
          embeddedKey: '$index',
          changes: [
            {
              key: '0',
              changes: [
                {
                  key: 'labels',
                  embeddedKey: '$value',
                  changes: [
                    { key: 'new', type: 'ADD', value: 'new' },
                    { key: 'old', type: 'REMOVE', value: 'old' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ])
  expect(compare(next, previous)[0]?.changes?.[1]).toMatchObject({
    key: 'new_field',
    embeddedKey: '$value',
    changes: [{ key: 'new', type: 'REMOVE', value: 'new' }],
  })
})

test('string-array duplicate counts are intentionally unobserved', () => {
  expect(compare({ labels: ['tools'] }, { labels: ['tools', 'tools'] })).toEqual([])
  expect(compare({ labels: ['tools', 'tools'] }, { labels: ['tools', 'new'] })).toMatchObject([
    { embeddedKey: '$value', changes: [{ key: 'new', type: 'ADD', value: 'new' }] },
  ])
})

test('null is a real value in both directions for string and numeric fields', () => {
  for (const value of ['bf16', 10]) {
    expect(compare({ field: value }, { field: null })).toEqual([
      { type: Operation.UPDATE, key: 'field', oldValue: value, value: null },
    ])
    expect(compare({ field: null }, { field: value })).toEqual([
      { type: Operation.UPDATE, key: 'field', oldValue: null, value },
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
