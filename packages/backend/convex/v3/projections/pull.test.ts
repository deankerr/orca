/* eslint-disable typescript/no-unsafe-type-assertion -- Minimal action double and access to Convex runtime handlers. */
import { expect, spyOn, test } from 'bun:test'
import assert from 'node:assert/strict'

import { ConvexHttpClient } from 'convex/browser'
import { getFunctionName } from 'convex/server'
import type { PaginationOptions } from 'convex/server'

import type { ActionCtx } from '../../_generated/server'
import { run } from './pull'

test('pulls all five tables sequentially, including pages after an empty partial page', async () => {
  const applied: string[] = []
  const cursors: (string | null)[] = []
  const query = spyOn(ConvexHttpClient.prototype, 'query').mockImplementation(async (ref, args) => {
    const { cursor } = (args as { paginationOpts: PaginationOptions }).paginationOpts
    cursors.push(cursor)
    return {
      page: cursor === 'empty' ? [] : [{ source: getFunctionName(ref) }],
      continueCursor: cursor === null ? 'empty' : 'last',
      isDone: cursor === 'last',
    }
  })
  const ctx = {
    runMutation: async (ref, args) => {
      const [, name] = getFunctionName(ref).split(':')
      assert.deepEqual(args, { rows: [{ source: `v3/projections/queries:${name}` }] })
      applied.push(name)
      return null
    },
  } as Pick<ActionCtx, 'runMutation'>
  const handler = (
    run as unknown as {
      _handler: (ctx: Pick<ActionCtx, 'runMutation'>, args: { sourceUrl: string }) => Promise<null>
    }
  )._handler

  try {
    await handler(ctx, { sourceUrl: 'https://example.convex.cloud' })
    expect(applied).toEqual([
      'models',
      'models',
      'providers',
      'providers',
      'endpoints',
      'endpoints',
      'endpointListings',
      'endpointListings',
      'endpointsPricing',
      'endpointsPricing',
    ])
    expect(cursors).toEqual(Array.from({ length: 5 }, () => [null, 'empty', 'last']).flat())

    query.mockRejectedValueOnce(new Error('source unavailable'))
    await assert.rejects(
      handler(ctx, { sourceUrl: 'https://example.convex.cloud' }),
      /source unavailable/,
    )
    expect(applied).toHaveLength(10)
  } finally {
    query.mockRestore()
  }
})
