/* oxlint-disable typescript/no-unsafe-type-assertion -- Minimal contexts exercise discovery without a deployment or stored blobs. */
import { expect, spyOn, test } from 'bun:test'
import { rejects } from 'node:assert/strict'

import { ConvexHttpClient } from 'convex/browser'

import type { ActionCtx, QueryCtx } from '../_generated/server'
import { namesAtOrAfter } from './index'
import { findLocalNames } from './local'

test('local discovery applies direction before limiting and preserves the inclusive lower bound', async () => {
  let lowerBound = ''
  let direction = 'asc'
  const range = {
    eq: (_field: string, value: string) => {
      expect(value).toBe('scans')
      return range
    },
    gte: (_field: string, value: string) => {
      lowerBound = value
      return range
    },
  }
  const ctx = {
    db: {
      query: () => ({
        withIndex: (_index: string, select: (range: unknown) => unknown) => {
          select(range)
          return {
            order: (order: string) => {
              direction = order
              return {
                take: (limit: number) => {
                  const names = ['a', 'b', 'c'].filter((name) => name >= lowerBound)
                  return (direction === 'desc' ? names.toReversed() : names)
                    .slice(0, limit)
                    .map((name) => ({ name }))
                },
              }
            },
          }
        },
      }),
    },
  } as unknown as QueryCtx
  const selection = { path: 'scans', atOrAfter: 'b', limit: 2 }

  expect(await findLocalNames(ctx, selection)).toEqual(['b', 'c'])
  expect(await findLocalNames(ctx, { ...selection, order: 'asc' })).toEqual(['b', 'c'])
  expect(await findLocalNames(ctx, { ...selection, order: 'desc' })).toEqual(['c', 'b'])
  expect(await findLocalNames(ctx, { ...selection, order: 'desc', limit: 1 })).toEqual(['c'])
  expect(await findLocalNames(ctx, { ...selection, atOrAfter: 'z', order: 'desc' })).toEqual([])
})

test('remote discovery forwards direction and rejects unordered, duplicate and out-of-range names', async () => {
  const source = process.env.ORCA_OBJECTS_SOURCE_DEPLOYMENT
  const key = process.env.ORCA_OBJECTS_API_KEY
  process.env.ORCA_OBJECTS_SOURCE_DEPLOYMENT = 'source-deployment'
  process.env.ORCA_OBJECTS_API_KEY = 'test-key'

  const query = spyOn(ConvexHttpClient.prototype, 'query').mockResolvedValue(['c', 'b'])
  const ctx = {
    meta: { getDeploymentMetadata: () => ({ name: 'consumer-deployment' }) },
  } as unknown as ActionCtx
  const selection = { path: 'scans', atOrAfter: 'b', limit: 2, order: 'desc' as const }

  try {
    expect(await namesAtOrAfter(ctx, selection)).toEqual(['c', 'b'])
    expect(query.mock.calls[0]?.[1]).toEqual({ ...selection, apiKey: 'test-key' })

    for (const invalid of [
      ['b', 'c'],
      ['c', 'c'],
      ['c', 'a'],
    ]) {
      query.mockResolvedValue(invalid)
      await rejects(namesAtOrAfter(ctx, selection), /order\/range/)
    }

    query.mockResolvedValue(['b', 'c'])
    expect(await namesAtOrAfter(ctx, { ...selection, order: undefined })).toEqual(['b', 'c'])
    query.mockResolvedValue(['c', 'b'])
    await rejects(namesAtOrAfter(ctx, { ...selection, order: undefined }), /order\/range/)
    query.mockResolvedValue([])
    expect(await namesAtOrAfter(ctx, selection)).toEqual([])
  } finally {
    query.mockRestore()

    if (source === undefined) {
      delete process.env.ORCA_OBJECTS_SOURCE_DEPLOYMENT
    } else {
      process.env.ORCA_OBJECTS_SOURCE_DEPLOYMENT = source
    }

    if (key === undefined) {
      delete process.env.ORCA_OBJECTS_API_KEY
    } else {
      process.env.ORCA_OBJECTS_API_KEY = key
    }
  }
})
