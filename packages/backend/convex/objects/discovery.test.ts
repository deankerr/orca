import { rejects } from 'node:assert/strict'

import { ConvexHttpClient } from 'convex/browser'
import { expect, vi, test } from 'vitest'

import type { ActionCtx, QueryCtx } from '#generated/server'

import { testDouble } from '../doubles.testing'
import { findLocalNames } from './local'
import { namesAtOrAfter } from './storage'

test('local discovery applies direction before limiting and preserves both bounds', async () => {
  let lowerBound = ''
  let upperBound: string | null = null
  let direction = 'asc'

  const range = {
    eq: (_field: string, value: string) => {
      expect(value).toBe('scans')

      return range
    },
    gte: (_field: string, value: string) => {
      lowerBound = value
      upperBound = null

      return range
    },
    lt: (_field: string, value: string) => {
      upperBound = value

      return range
    },
  }

  const ctx = testDouble<QueryCtx>({
    db: {
      query: () => ({
        withIndex: (_index: string, select: (builder: typeof range) => typeof range) => {
          select(range)

          return {
            order: (order: string) => {
              direction = order

              return {
                take: (limit: number) => {
                  const names = ['a', 'b', 'c'].filter(
                    (name) => name >= lowerBound && (upperBound === null || name < upperBound),
                  )

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
  })

  const selection = { atOrAfter: 'b', limit: 2, path: 'scans' }

  expect(await findLocalNames(ctx, selection)).toEqual(['b', 'c'])
  expect(await findLocalNames(ctx, { ...selection, order: 'asc' })).toEqual(['b', 'c'])
  expect(await findLocalNames(ctx, { ...selection, order: 'desc' })).toEqual(['c', 'b'])
  expect(await findLocalNames(ctx, { ...selection, limit: 1, order: 'desc' })).toEqual(['c'])
  expect(await findLocalNames(ctx, { ...selection, atOrAfter: 'z', order: 'desc' })).toEqual([])
  expect(await findLocalNames(ctx, { ...selection, atOrAfter: '', before: 'c' })).toEqual([
    'a',
    'b',
  ])
  expect(
    await findLocalNames(ctx, {
      ...selection,
      atOrAfter: '',
      before: 'c',
      limit: 1,
      order: 'desc',
    }),
  ).toEqual(['b'])
})

test('remote discovery forwards direction and rejects unordered, duplicate and out-of-range names', async () => {
  const source = process.env.ORCA_OBJECTS_SOURCE_DEPLOYMENT
  const key = process.env.ORCA_OBJECTS_API_KEY
  process.env.ORCA_OBJECTS_SOURCE_DEPLOYMENT = 'source-deployment'
  process.env.ORCA_OBJECTS_API_KEY = 'test-key'

  const query = vi.spyOn(ConvexHttpClient.prototype, 'query').mockResolvedValue(['c', 'b'])

  const ctx = testDouble<ActionCtx>({
    meta: { getDeploymentMetadata: () => ({ name: 'consumer-deployment' }) },
  })

  const selection = { atOrAfter: 'b', limit: 2, order: 'desc' as const, path: 'scans' }

  try {
    expect(await namesAtOrAfter(ctx, selection)).toEqual(['c', 'b'])
    expect(query.mock.calls[0]?.[1]).toEqual({ ...selection, apiKey: 'test-key' })

    for (const invalid of [
      ['b', 'c'],
      ['c', 'c'],
      ['c', 'a'],
    ]) {
      query.mockResolvedValue(invalid)
      await rejects(namesAtOrAfter(ctx, selection), /order\/range/u)
    }

    query.mockResolvedValue(['b', 'c'])
    expect(await namesAtOrAfter(ctx, { ...selection, order: undefined })).toEqual(['b', 'c'])
    query.mockResolvedValue(['c', 'b'])
    await rejects(namesAtOrAfter(ctx, { ...selection, order: undefined }), /order\/range/u)
    query.mockResolvedValue([])
    expect(await namesAtOrAfter(ctx, selection)).toEqual([])

    const bounded = { ...selection, before: 'c' }
    query.mockResolvedValue(['b'])
    expect(await namesAtOrAfter(ctx, bounded)).toEqual(['b'])
    expect(query.mock.lastCall?.[1]).toEqual({ ...bounded, apiKey: 'test-key' })
    query.mockResolvedValue(['c', 'b'])
    await rejects(namesAtOrAfter(ctx, bounded), /order\/range/u)
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
