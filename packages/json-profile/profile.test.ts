// oxlint-disable sort-keys -- Expected objects mirror the serialized JSON profile format.

import { describe, expect, test } from 'bun:test'

import { evaluate, test as isValidJsonPath } from '@swaggerexpert/jsonpath'

import type {
  FieldProfile,
  JsonRecord,
  JsonType,
  JsonTypeProfile,
  ObjectProfile,
  ValueProfile,
} from './profile.ts'
import { profileJsonRecords } from './profile.ts'

describe('profileJsonRecords', () => {
  test('distinguishes none from null and profiles exact key sets and values', () => {
    const report = profileJsonRecords([
      { nested: { enabled: true }, status: null },
      { nested: {}, status: 'ready' },
      { nested: { enabled: false } },
    ])
    const root = findType(report.root, 'object')
    const status = findField(root, 'status')
    const nested = findType(findField(root, 'nested'), 'object')

    expect(report.record_count).toBe(3)
    expect(report.root.path).toBe('$[*]')
    expect(root.key_sets).toEqual([
      { count: 2, keys: ['nested', 'status'] },
      { count: 1, keys: ['nested'] },
    ])
    expect(status).toMatchObject({
      name: 'status',
      none: 1,
      path: '$[*]["status"]',
      population: 3,
      types: [
        { type: 'null', count: 1 },
        {
          type: 'string',
          count: 1,
          values: [{ value: 'ready', count: 1 }],
        },
      ],
    })
    expect(Object.keys(status)).toEqual(['name', 'path', 'population', 'none', 'types'])
    expect(findField(nested, 'enabled')).toMatchObject({
      none: 1,
      population: 3,
      types: [
        {
          count: 2,
          type: 'boolean',
          values: [
            { value: false, count: 1 },
            { value: true, count: 1 },
          ],
        },
      ],
    })
  })

  test('aggregates unordered arrays while retaining lengths, multiplicity, and nested fields', () => {
    const records: JsonRecord[] = [
      {
        items: [
          { kind: 'a', score: 1 },
          { kind: 'b', score: 2 },
        ],
        tags: ['x', 'x'],
      },
      { items: [{ kind: 'a' }], tags: [] },
    ]
    const report = profileJsonRecords(records)
    const root = findType(report.root, 'object')
    const items = findType(findField(root, 'items'), 'array')
    const itemObjects = findType(items.items, 'object')
    const tags = findType(findField(root, 'tags'), 'array')

    expect(items).toMatchObject({
      count: 2,
      items: {
        path: '$[*]["items"][*]',
        population: 3,
      },
      lengths: [
        { length: 1, count: 1 },
        { length: 2, count: 1 },
      ],
      type: 'array',
    })
    expect(Object.keys(items)).toEqual(['type', 'count', 'lengths', 'items'])
    expect(Object.keys(itemObjects)).toEqual(['type', 'count', 'key_sets', 'fields'])
    expect(itemObjects.key_sets).toEqual([
      { count: 2, keys: ['kind', 'score'] },
      { count: 1, keys: ['kind'] },
    ])
    expect(findField(itemObjects, 'score')).toMatchObject({ none: 1, population: 3 })
    expect(findField(itemObjects, 'kind').types).toEqual([
      {
        count: 3,
        type: 'string',
        values: [
          { value: 'a', count: 2 },
          { value: 'b', count: 1 },
        ],
      },
    ])
    expect(tags.items).toMatchObject({
      population: 2,
      types: [
        {
          count: 2,
          type: 'string',
          values: [{ value: 'x', count: 2 }],
        },
      ],
    })
  })

  test('produces byte-identical data when record, key, and array order change', () => {
    const left = profileJsonRecords([
      { id: 'one', values: [2, 1] },
      { id: 'two', values: [3] },
    ])
    const right = profileJsonRecords([
      { id: 'two', values: [3] },
      { id: 'one', values: [1, 2] },
    ])

    expect(JSON.stringify(left)).toBe(JSON.stringify(right))
  })

  test('keeps mixed-type details on their owning branches', () => {
    const report = profileJsonRecords([
      { payload: { object_value: 1 }, score: 2 },
      { payload: [{ item_value: true }], score: 0 },
      { payload: 'primitive' },
    ])
    const root = findType(report.root, 'object')
    const payload = findField(root, 'payload')
    const payloadObject = findType(payload, 'object')
    const payloadArray = findType(payload, 'array')
    const arrayItemObject = findType(payloadArray.items, 'object')

    expect(payload.types.map(({ type }) => type)).toEqual(['string', 'object', 'array'])
    expect(findField(payloadObject, 'object_value').population).toBe(1)
    expect(findField(arrayItemObject, 'item_value').population).toBe(1)
    expect(findField(root, 'score')).toMatchObject({
      none: 1,
      types: [
        {
          count: 2,
          type: 'number',
          values: [
            { value: 0, count: 1 },
            { value: 2, count: 1 },
          ],
        },
      ],
    })
  })

  test('emits RFC 9535 paths that independently select every observed location', () => {
    const records: JsonRecord[] = [
      {
        '': 'empty',
        'a.[b': {
          'back\\slash': [[{ '*': true }]],
          'line\nfeed': 1,
          'quoted"key': 'value',
          雪: null,
        },
      },
    ]
    const report = profileJsonRecords(records)

    assertPathsSelectObservedValues(report.root, records, report.root.population)
  })

  test('represents empty record populations and empty arrays without inventing item types', () => {
    expect(profileJsonRecords([])).toEqual({
      profile_format: 'json-record-profile-v1',
      record_count: 0,
      root: { path: '$[*]', population: 0, types: [] },
    })

    const report = profileJsonRecords([{ items: [] }])
    const root = findType(report.root, 'object')
    const items = findType(findField(root, 'items'), 'array')
    expect(items.items).toEqual({
      path: '$[*]["items"][*]',
      population: 0,
      types: [],
    })
  })
})

function assertPathsSelectObservedValues(
  profile: ValueProfile,
  records: JsonRecord[],
  expectedMatches: number,
): void {
  expect(isValidJsonPath(profile.path), profile.path).toBe(true)
  expect(evaluate(records, profile.path), profile.path).toHaveLength(expectedMatches)

  for (const type of profile.types) {
    if (type.type === 'object') {
      for (const field of type.fields) {
        assertPathsSelectObservedValues(field, records, field.population - field.none)
      }
    } else if (type.type === 'array') {
      assertPathsSelectObservedValues(type.items, records, type.items.population)
    }
  }
}

function findField(object: ObjectProfile, name: string): FieldProfile {
  const field = object.fields.find((candidate) => candidate.name === name)
  if (field === undefined) {
    throw new Error(`Missing field: ${name}`)
  }
  return field
}

function findType<Type extends JsonType>(
  profile: ValueProfile,
  type: Type,
): Extract<JsonTypeProfile, { type: Type }> {
  const found = profile.types.find(
    (candidate): candidate is Extract<JsonTypeProfile, { type: Type }> => candidate.type === type,
  )
  if (found === undefined) {
    throw new Error(`Missing type: ${type}`)
  }
  return found
}
