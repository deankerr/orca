import { expect, test } from 'bun:test'
/* eslint-disable typescript/no-unsafe-type-assertion -- Minimal database double and access to Convex's runtime handlers for recovery tests. */
import assert from 'node:assert/strict'

import { getFunctionName } from 'convex/server'

import type { MutationCtx } from '../_generated/server'
import { complete } from '../v3/ingestions'
import { V3_SCAN_INGESTIONS_TABLE } from '../v3/ingestions.table'
import * as registered from './apply'
import { applyViewWrites } from './consume'
import { V3_ENDPOINTS_STATS_SERIES_TABLE } from './series.table'
import type { ScanProjectionWrite } from './writes'

const mutations = { ...registered, applyScanProjection: applyViewWrites }

const writes: ScanProjectionWrite[] = [
  ...Array.from({ length: 501 }, (_, index): ScanProjectionWrite => ({
    table: 'endpointListings',
    row: { endpoint_id: String(index), scan_at: '2026-09-05', state: 'listed' },
  })),
  {
    table: 'stats',
    row: { endpoint_id: 'one', scan_at: '2026-09-05', tier: 'default', sample: { latency: 1 } },
  },
]

test('retries stats safely before the action separately records ingestion completion', async () => {
  const rows: Record<string, Record<string, unknown>[]> = {}

  const ctx = {
    db: {
      query(table: string) {
        let matches = rows[table] ?? []

        const query = {
          order: () => query,
          first: () => matches.at(-1) ?? null,
          collect: () => matches,
          withIndex: (_name: string, select: (q: unknown) => unknown) => {
            const range = {
              eq(field: string, value: unknown) {
                matches = matches.filter((row) => row[field] === value)
                return range
              },
            }

            select(range)
            return query
          },
          unique: () => {
            expect(matches.length).toBeLessThanOrEqual(1)
            return matches[0] ?? null
          },
        }
        return query
      },
      insert(table: string, row: Record<string, unknown>) {
        ;(rows[table] ??= []).push(row)
      },
    },
  } as unknown as MutationCtx
  type Args = { fromArtifactId: string; toArtifactId: string; rows: unknown[] }
  const handlers = { ...mutations, complete } as unknown as Record<
    string,
    { _handler: (ctx: MutationCtx, args: Args) => Promise<null> }
  >

  const calls: string[] = []
  let interrupt = true

  const actionCtx = {
    runMutation: async (ref, args) => {
      const [, name] = getFunctionName(ref).split(':')
      calls.push(name)

      if (name === 'stats' && interrupt) {
        interrupt = false
        throw new Error('interrupted')
      }

      return await handlers[name]._handler(ctx, args as Args)
    },
  } as Parameters<typeof mutations.applyScanProjection>[0]

  const args = { fromArtifactId: 'initial', toArtifactId: 'next', scan_at: '2026-09-05', writes }
  await assert.rejects(mutations.applyScanProjection(actionCtx, args), /interrupted/)
  expect(calls).toEqual(['endpointListings', 'stats'])
  expect(rows[V3_SCAN_INGESTIONS_TABLE]).toBeUndefined()
  expect(Object.values(rows).flat()).toHaveLength(501)
  await mutations.applyScanProjection(actionCtx, args)
  expect(Object.values(rows).flat()).toHaveLength(502)
  expect(rows[V3_ENDPOINTS_STATS_SERIES_TABLE]).toHaveLength(1)
  expect(rows[V3_SCAN_INGESTIONS_TABLE]).toBeUndefined()
  await mutations.applyScanProjection(actionCtx, args)
  expect(Object.values(rows).flat()).toHaveLength(502)

  // Simulate restarting after stats committed but before the action recorded completion.
  const finish = handlers.complete._handler as unknown as (
    ctx: MutationCtx,
    scan: { from_artifact_id: string; to_artifact_id: string; scan_at: string },
  ) => Promise<null>
  const scan = { from_artifact_id: 'initial', to_artifact_id: 'next', scan_at: args.scan_at }
  await finish(ctx, scan)
  await finish(ctx, scan)
  expect(rows[V3_SCAN_INGESTIONS_TABLE]).toHaveLength(1)
  expect(Object.values(rows).flat()).toHaveLength(503)

  await assert.rejects(finish(ctx, { ...scan, to_artifact_id: 'stale' }), /cursor changed/)

  calls.length = 0

  await mutations.applyScanProjection(actionCtx, {
    scan_at: '2026-09-06',
    fromArtifactId: 'next',
    toArtifactId: 'empty',
    writes: [],
  })

  expect(calls).toEqual(['stats'])
  expect(rows[V3_SCAN_INGESTIONS_TABLE]).toHaveLength(1)
  await finish(ctx, {
    from_artifact_id: 'next',
    to_artifact_id: 'empty',
    scan_at: '2026-09-06',
  })
  expect(rows[V3_SCAN_INGESTIONS_TABLE]).toHaveLength(2)
  expect(rows[V3_SCAN_INGESTIONS_TABLE].at(-1)?.scan_at).toBe('2026-09-06')
  expect(rows[V3_ENDPOINTS_STATS_SERIES_TABLE]).toHaveLength(1)
})
