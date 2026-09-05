import { expect, test } from 'bun:test'
/* eslint-disable typescript/no-unsafe-type-assertion -- Minimal database double and access to Convex's runtime handler for recovery tests. */
import assert from 'node:assert/strict'

import type { FunctionArgs } from 'convex/server'

import type { internal } from '../../_generated/api'
import type { MutationCtx } from '../../_generated/server'
import { V3_SCAN_INGESTIONS_TABLE } from '../ingestions.table'
import {
  apply,
  applyScanProjection,
  projectionWriteBatches,
  MAX_BATCH_WRITES,
  TARGET_BATCH_BYTES,
} from './apply'
import type { ScanProjectionWrite } from './diff'

const writes: ScanProjectionWrite[] = Array.from(
  { length: MAX_BATCH_WRITES * 2 + 1 },
  (_, index) => ({
    table: 'endpointListings',
    row: { endpoint_id: String(index), scan_at: '2026-09-05', state: 'listed' },
  }),
)

test('bounds batches by count and bytes, including an empty diff', () => {
  const batches = projectionWriteBatches(writes)
  expect(batches.map((batch) => batch.length)).toEqual([MAX_BATCH_WRITES, MAX_BATCH_WRITES, 1])
  expect(batches.flat()).toEqual(writes)
  expect(projectionWriteBatches([])).toEqual([[]])
  const large: ScanProjectionWrite = {
    table: 'endpointsPricing',
    row: {
      endpoint_id: 'one',
      scan_at: 'now',
      discount: 0,
      meters: { large: 'x'.repeat(Math.ceil(TARGET_BATCH_BYTES / 2)) },
    },
  }
  expect(projectionWriteBatches([large, large]).map((batch) => batch.length)).toEqual([1, 1])
})

test('replays a partially applied scan without duplicate history or early cursor advancement', async () => {
  // Small database double: exercise the actual mutation handler and action orchestration.
  const rows: Record<string, Record<string, unknown>[]> = {}
  const ctx = {
    db: {
      query(table: string) {
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
  const handler = (
    apply as unknown as {
      _handler: (
        ctx: MutationCtx,
        args: FunctionArgs<typeof internal.v3.projections.apply.apply>,
      ) => Promise<null>
    }
  )._handler
  let calls = 0
  const actionCtx = {
    runMutation: async (
      _ref: unknown,
      args: FunctionArgs<typeof internal.v3.projections.apply.apply>,
    ) => {
      calls += 1
      if (calls === 2) {
        throw new Error('interrupted')
      }
      return await handler(ctx, args)
    },
  } as Parameters<typeof applyScanProjection>[0]
  const args = { fromArtifactId: 'initial', toArtifactId: 'next', writes }
  await assert.rejects(applyScanProjection(actionCtx, args), /interrupted/)
  expect(rows[V3_SCAN_INGESTIONS_TABLE]).toBeUndefined()
  expect(Object.values(rows).flat()).toHaveLength(MAX_BATCH_WRITES)
  await applyScanProjection(actionCtx, args)
  expect(Object.values(rows).flat()).toHaveLength(writes.length + 1)
  expect(rows[V3_SCAN_INGESTIONS_TABLE]).toHaveLength(1)
  await applyScanProjection(actionCtx, args)
  expect(Object.values(rows).flat()).toHaveLength(writes.length + 1)
  await assert.rejects(
    handler(ctx, { ...args, toArtifactId: 'stale', complete: true }),
    /cursor changed/,
  )
})
