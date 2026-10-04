import { expect, test } from 'bun:test'

import { profileJsonRecords } from './profile'
import type { JsonRecord } from './profile'
import { viewProfile } from './view'

test('views retain exact populations, missing/null distinctions, and array occurrences', () => {
  const profile = profileJsonRecords([
    { nested: { score: 1 }, price: '0.1', tags: ['x', 'x'] },
    { nested: { score: 1 }, tags: [] },
    { nested: { score: 100 } },
    { nested: { score: null } },
    { nested: {} },
    {},
  ])

  const view = viewProfile(profile, { valueLimit: 0 })
  expect(view.record_count).toBe(6)
  const score = view.fields.find((field) => field.path.endsWith('["score"]'))
  expect(score).toMatchObject({ missing: 1, population: 5 })

  expect(score?.types).toEqual([
    { count: 1, type: 'null' },
    {
      count: 3,
      summary: { count: 3, max: 100, median: 1, min: 1, p95: 100 },
      type: 'number',
      values: {
        complete: false,
        distinct_count: 2,
        entries: [],
        omitted_distinct_count: 2,
        omitted_occurrence_count: 3,
      },
    },
  ])

  expect(view.fields.find((field) => field.path === '$[*]["tags"][*]')?.population).toBe(2)
  expect(view.fields.find((field) => field.path === '$[*]["tags"]')?.types[0]).toMatchObject({
    length_summary: { count: 2, max: 2, median: 0, min: 0, p95: 2 },
    lengths: { complete: false, distinct_count: 2, entries: [], omitted_occurrence_count: 2 },
  })
  expect(view.fields.find((field) => field.path === '$[*]["price"]')?.types[0]).not.toHaveProperty(
    'summary',
  )
})

test('bounded views account for omitted long strings and frequencies without changing full detail', () => {
  const long = 'a'.repeat(161)
  const profile = profileJsonRecords([
    { value: long },
    { value: long },
    { value: 'b' },
    { value: 'c' },
  ])
  const original = JSON.stringify(profile)
  const paths = ['$[*]["value"]']
  const compact = viewProfile(profile, { paths, valueLimit: 1 })

  expect(compact.fields).toHaveLength(1)
  expect(compact.fields[0]?.types[0]).toMatchObject({
    values: {
      complete: false,
      distinct_count: 3,
      entries: [{ count: 1, value: 'b' }],
      omitted_distinct_count: 2,
      omitted_occurrence_count: 3,
    },
  })

  expect(viewProfile(profile, { paths, valueLimit: null }).fields[0]?.types[0]).toMatchObject({
    values: {
      complete: true,
      entries: [
        { count: 2, value: long },
        { count: 1, value: 'b' },
        { count: 1, value: 'c' },
      ],
      omitted_distinct_count: 0,
      omitted_occurrence_count: 0,
    },
  })

  expect(JSON.stringify(profile)).toBe(original)
  expect(viewProfile(profile, { paths: [] }).fields).toEqual([])
})

test('views are deterministic, preserve empty populations, and reject invalid limits', () => {
  const records: JsonRecord[] = [{ a: 2 }, { a: 1 }, { a: 2 }, {}]
  expect(viewProfile(profileJsonRecords(records))).toEqual(
    viewProfile(profileJsonRecords(records.toReversed())),
  )
  expect(viewProfile(profileJsonRecords([]))).toMatchObject({
    fields: [{ path: '$[*]', population: 0, types: [] }],
    record_count: 0,
  })

  for (const valueLimit of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => viewProfile(profileJsonRecords(records), { valueLimit })).toThrow('valueLimit')
  }
})
