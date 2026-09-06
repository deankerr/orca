import { expect, test } from 'bun:test'
/* eslint-disable typescript/no-unsafe-type-assertion -- Minimal database double and access to Convex's runtime handlers for recovery tests. */
import assert from 'node:assert/strict'

import { getFunctionName } from 'convex/server'

import type { MutationCtx } from '../../_generated/server'
import { V3_SCAN_INGESTIONS_TABLE } from '../ingestions.table'
import { V3_ENDPOINTS_STATS_SERIES_TABLE } from '../series.table'
import * as mutations from './apply'
import type { ScanProjectionWrite } from './diff'

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

test('replays table writes and commits stats last without querying stats', async () => {
  const rows: Record<string, Record<string, unknown>[]> = {}
  const ctx = {
    db: {
      query(table: string) {
        expect(table).not.toBe(V3_ENDPOINTS_STATS_SERIES_TABLE)
        let matches = rows[table] ?? []
        const query = {
          order: () => query,
          first: () => matches.at(-1) ?? null,
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
  const handlers = mutations as unknown as Record<
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
  const args = { fromArtifactId: 'initial', toArtifactId: 'next', writes }
  await assert.rejects(mutations.applyScanProjection(actionCtx, args), /interrupted/)
  expect(calls).toEqual(['endpointListings', 'stats'])
  expect(rows[V3_SCAN_INGESTIONS_TABLE]).toBeUndefined()
  expect(Object.values(rows).flat()).toHaveLength(501)
  await mutations.applyScanProjection(actionCtx, args)
  expect(Object.values(rows).flat()).toHaveLength(503)
  expect(rows[V3_ENDPOINTS_STATS_SERIES_TABLE]).toHaveLength(1)
  expect(rows[V3_SCAN_INGESTIONS_TABLE]).toHaveLength(1)
  await mutations.applyScanProjection(actionCtx, args)
  expect(Object.values(rows).flat()).toHaveLength(503)
  await assert.rejects(
    mutations.applyScanProjection(actionCtx, { ...args, toArtifactId: 'stale' }),
    /cursor changed/,
  )
  calls.length = 0
  await mutations.applyScanProjection(actionCtx, {
    fromArtifactId: 'next',
    toArtifactId: 'empty',
    writes: [],
  })
  expect(calls).toEqual(['stats'])
  expect(rows[V3_SCAN_INGESTIONS_TABLE]).toHaveLength(2)
  expect(rows[V3_ENDPOINTS_STATS_SERIES_TABLE]).toHaveLength(1)
})
