import { afterEach, expect, test } from 'bun:test'

import { ingestionParallelism } from './pool'
import { queueCapacity } from './queue'

const previous = process.env.ORCA_INGESTION_PARALLELISM

afterEach(() => {
  if (previous === undefined) {
    Reflect.deleteProperty(process.env, 'ORCA_INGESTION_PARALLELISM')
  } else {
    process.env.ORCA_INGESTION_PARALLELISM = previous
  }
})

test('parallelism defaults when unset, follows the env var, and sizes the queue capacity', () => {
  Reflect.deleteProperty(process.env, 'ORCA_INGESTION_PARALLELISM')
  expect(ingestionParallelism()).toBe(16)

  process.env.ORCA_INGESTION_PARALLELISM = '64'
  expect(ingestionParallelism()).toBe(64)
  expect(queueCapacity()).toBe(256)
})

test('invalid parallelism fails loudly instead of silently falling back', () => {
  for (const value of ['0', '101', '2.5', 'many']) {
    process.env.ORCA_INGESTION_PARALLELISM = value
    expect(() => ingestionParallelism()).toThrow(/ORCA_INGESTION_PARALLELISM/u)
  }
})
