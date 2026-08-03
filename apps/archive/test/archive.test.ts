import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'

import * as Effect from 'effect/Effect'

import { DEFAULT_EXPORT_DIRECTORY, inspect } from '../src/archive.ts'

describe('archive inspection', () => {
  test.skipIf(!existsSync(DEFAULT_EXPORT_DIRECTORY))(
    'reports the production snapshot without expanding it',
    async () => {
      const result = await Effect.runPromise(inspect(DEFAULT_EXPORT_DIRECTORY))

      expect(result.storageBlobs).toBeGreaterThan(19_000)
      expect(result.crawlRows).toBe(result.storageBlobs)
      expect(result.tables.length).toBeGreaterThan(1)
    },
  )
})
