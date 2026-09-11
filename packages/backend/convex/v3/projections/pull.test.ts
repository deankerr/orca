/* eslint-disable typescript/no-unsafe-type-assertion -- Minimal action double and access to Convex runtime handlers. */
import { expect, spyOn, test } from 'bun:test'
import assert from 'node:assert/strict'

import { ConvexHttpClient } from 'convex/browser'
import { getFunctionName } from 'convex/server'
import type { PaginationOptions } from 'convex/server'

import type { ActionCtx } from '../../_generated/server'
import { run } from './pull'

test('pulls five tables then commits the captured scan even when it has no stats', async () => {
  const applied: string[] = []
  const cursors: (string | null)[] = []
  const scan = {
    from_artifact_id: 'previous',
    to_artifact_id: 'current',
    scan_at: '2026-09-09T00:00:00.000Z',
  }

  const query = spyOn(ConvexHttpClient.prototype, 'query').mockImplementation(async (ref, args) => {
    if (getFunctionName(ref).endsWith(':currentScan')) {
      return scan
    }
    if (getFunctionName(ref).endsWith(':scanStats')) {
      assert.deepEqual(args, { scan_at: scan.scan_at })
      return []
    }

    const { cursor } = (args as { paginationOpts: PaginationOptions }).paginationOpts
    cursors.push(cursor)
    return {
      page: cursor === 'empty' ? [] : [{ source: getFunctionName(ref) }],
      continueCursor: cursor === null ? 'empty' : 'last',
      isDone: cursor === 'last',
    }
  })

  let stored = false
  const artifactFetch = spyOn(globalThis, 'fetch').mockImplementation((async (
    input: URL | RequestInfo,
  ) => {
    const url = new URL(input instanceof Request ? input.url : input)
    expect(url.pathname).toBe('/objects')
    expect(url.searchParams.get('path')).toBe('scans')
    expect(url.searchParams.get('name')).toBe(scan.to_artifact_id)
    return new Response('{"scan_at":"2026-09-09T00:00:00.000Z"}\n')
  }) as typeof fetch)

  const ctx = {
    runQuery: async () => (stored ? { backend: 'convex' } : null),
    storage: { store: async () => 'storage-id' } as unknown as ActionCtx['storage'],
    runMutation: async (ref, args) => {
      const [, name] = getFunctionName(ref).split(':')
      if (name === 'insert') {
        stored = true
        return null
      }
      if (name === 'currentScan') {
        assert.equal(stored, true)
        assert.deepEqual(args, { scan, rows: [] })
        applied.push(name)
        return null
      }

      assert.deepEqual(args, { rows: [{ source: `v3/projections/queries:${name}` }] })
      applied.push(name)
      return null
    },
  } as Pick<ActionCtx, 'runMutation' | 'runQuery' | 'storage'>

  const handler = (
    run as unknown as {
      _handler: (
        ctx: Pick<ActionCtx, 'runMutation' | 'runQuery' | 'storage'>,
        args: { sourceUrl?: string },
      ) => Promise<null>
    }
  )._handler

  const previousSource = process.env.ORCA_PULL_SOURCE_URL
  try {
    process.env.ORCA_PULL_SOURCE_URL = 'invalid-default-overridden-by-argument'
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
      'currentScan',
    ])

    expect(cursors).toEqual(Array.from({ length: 5 }, () => [null, 'empty', 'last']).flat())

    query.mockRejectedValueOnce(new Error('source unavailable'))

    await assert.rejects(
      handler(ctx, { sourceUrl: 'https://example.convex.cloud' }),
      /source unavailable/,
    )

    expect(applied).toHaveLength(11)

    delete process.env.ORCA_PULL_SOURCE_URL
    await handler(ctx, {})
    expect(applied).toHaveLength(11)

    process.env.ORCA_PULL_SOURCE_URL = 'https://default.convex.cloud'
    await handler(ctx, {})
    expect(applied).toHaveLength(22)
    expect(artifactFetch).toHaveBeenCalledTimes(1)
  } finally {
    query.mockRestore()
    artifactFetch.mockRestore()

    if (previousSource === undefined) {
      delete process.env.ORCA_PULL_SOURCE_URL
    } else {
      process.env.ORCA_PULL_SOURCE_URL = previousSource
    }
  }
})
