/* oxlint-disable typescript/no-unsafe-type-assertion -- A minimal database double exercises the registered mutation and work guards without deploying test functions. */
import { expect, test } from 'bun:test'
import { rejects } from 'node:assert/strict'

import type { MutationCtx } from '../../_generated/server'
import type { WorkId } from '../ingestion/work'
import type { ScanPairTimes } from '../scan/time'
import { commit } from './ingest'
import type { EventRow } from './table'

const commitHandler = (
  commit as unknown as {
    _handler: (
      ctx: MutationCtx,
      args: ScanPairTimes & { work_id: WorkId; rows: EventRow[] },
    ) => Promise<string[]>
  }
)._handler

test('event commits bind both pair times, complete empty work, and make retries idempotent', async () => {
  const pair = {
    from_scan_at: '2026-09-28T10:00:00.000Z',
    scan_at: '2026-09-28T11:00:00.000Z',
  }

  const work_id = 'work' as WorkId
  let state = 'pending'
  let processor = 'events'
  let failInsert = false
  let modelScanAt = pair.from_scan_at
  let earlierListing = false
  const writes: EventRow[] = []

  const ctx = {
    db: {
      query: (table: string) => ({
        withIndex: () => ({
          first: async () => (earlierListing ? {} : null),
          unique: async () => {
            expect(table).toBe('v4_models')
            return { scan_at: modelScanAt }
          },
        }),
      }),
      get: async (table: string) => {
        if (table === 'v4_processor_work') {
          return {
            _id: work_id,
            ingestion_id: 'ingestion',
            scan_at: pair.scan_at,
            state,
            processor,
          }
        }

        expect(table).toBe('v4_scan_ingestions')
        return pair
      },
      insert: async (table: string, row: EventRow) => {
        expect(table).toBe('v4_events')

        if (failInsert) {
          throw new Error('insert failed')
        }

        writes.push(row)
        return 'event'
      },
      patch: async (table: string, id: string, { state: nextState }: { state: string }) => {
        expect(table).toBe('v4_processor_work')
        expect(id).toBe(work_id)
        state = nextState
      },
    },
  } as unknown as MutationCtx

  const row: EventRow = {
    scan_at: pair.scan_at,
    entity_kind: 'model',
    entity_id: 'author/model',
    type: 'ADD',
    change_json: '{"key":"author/model","type":"ADD","value":{"display_name":"Model"}}',
    context: { model: { model_id: 'author/model', display_name: 'Model' } },
  }

  const args = { ...pair, work_id, rows: [row] }

  for (const mismatched of [
    { ...args, from_scan_at: 'wrong', rows: [] },
    { ...args, scan_at: 'wrong', rows: [] },
    { ...args, rows: [{ ...row, scan_at: 'wrong' }] },
  ]) {
    await rejects(commitHandler(ctx, mismatched), /Processor output does not match/)
  }
  processor = 'pricing'
  await rejects(commitHandler(ctx, args), /Processor work does not match/)
  processor = 'events'
  expect(writes).toEqual([])
  expect(state).toBe('pending')

  failInsert = true
  await rejects(commitHandler(ctx, args), /insert failed/)
  expect(state).toBe('pending')
  failInsert = false
  expect(await commitHandler(ctx, args)).toEqual(['event'])
  expect(await commitHandler(ctx, args)).toEqual([])
  expect(writes).toEqual([{ ...row, previously_known: true }])
  expect(state).toBe('complete')

  state = 'pending'
  await commitHandler(ctx, { ...args, rows: [] })
  expect(state).toBe('complete')
  expect(writes).toHaveLength(1)

  // Same-scan or later metadata updates erase Catalog's evidence of historical-only knowledge.
  for (const scanAt of [pair.scan_at, '2026-09-28T12:00:00.000Z']) {
    modelScanAt = scanAt

    for (const listedBefore of [false, true]) {
      state = 'pending'
      earlierListing = listedBefore
      await commitHandler(ctx, args)
      expect(writes.at(-1)?.previously_known).toBe(listedBefore)
    }
  }
})
