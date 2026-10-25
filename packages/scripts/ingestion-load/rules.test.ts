import { describe, expect, it } from 'vitest'

import { findProblems, parseOptions } from './rules'
import type { RawOptions, RunOutcome } from './rules'

const raw: RawOptions = {
  deployment: 'dev:a-b-1',
  hours: '24',
  parallelism: '32',
  poll: '10',
  timeout: '30',
}

describe('parseOptions', () => {
  it('parses defaults', () => {
    expect(parseOptions(raw)).toMatchObject({ hours: 24, parallelism: 32, poll: 10, timeout: 30 })
  })

  it.each(['0', '101', '320', '1.5', 'abc', '', '-3', '1e2'])('rejects parallelism %j', (value) => {
    expect(() => parseOptions({ ...raw, parallelism: value })).toThrow('--parallelism')
  })

  it('accepts the bounds', () => {
    expect(parseOptions({ ...raw, parallelism: '1' }).parallelism).toBe(1)
    expect(parseOptions({ ...raw, parallelism: '100' }).parallelism).toBe(100)
  })

  it.each([
    ['hours', '0'],
    ['hours', 'x'],
    ['timeout', '0'],
    ['timeout', '2.5'],
    ['poll', '-1'],
  ] as const)('rejects %s %j', (key, value) => {
    expect(() => parseOptions({ ...raw, [key]: value })).toThrow(`--${key}`)
  })
})

describe('findProblems', () => {
  const clean: RunOutcome = {
    completionLostLogged: 0,
    failedRecords: 0,
    logsStoppedEarly: false,
    occExhausted: 0,
    stillOpen: 0,
    timedOut: false,
  }

  it('passes a clean run', () => {
    expect(findProblems(clean)).toEqual([])
  })

  it.each([
    { timedOut: true },
    { stillOpen: 1 },
    { failedRecords: 2 },
    { occExhausted: 1 },
    { completionLostLogged: 1 },
    { logsStoppedEarly: true },
  ])('fails on %j', (change) => {
    expect(findProblems({ ...clean, ...change })).toHaveLength(1)
  })
})
