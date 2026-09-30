/* oxlint-disable typescript/no-unsafe-type-assertion -- In-memory rows exercise destructive range boundaries and cleanup continuations without touching a deployment. */
import { expect, test } from 'bun:test'
import { rejects } from 'node:assert/strict'

import { getFunctionName } from 'convex/server'
import type { RegisteredMutation } from 'convex/server'

import type { MutationCtx } from '../_generated/server'
import { deleteEvents, stripLegacyWork } from './cleanup'

function handler<Args extends Record<string, unknown>, Result>(
  fn: RegisteredMutation<'internal', Args, Result>,
) {
  return (fn as unknown as { _handler: (ctx: MutationCtx, args: Args) => Promise<Result> })._handler
}

function database(initial: Record<string, Record<string, unknown>[]>) {
  const tables = structuredClone(initial)
  const scheduled: { name: string; args: Record<string, unknown> }[] = []

  const ctx = {
    db: {
      query: (table: string) => {
        let rows = [...(tables[table] ?? [])]

        const range = {
          eq: (key: string, value: unknown) => {
            rows = rows.filter((row) => row[key] === value)
            return range
          },
          gte: (key: string, value: string) => {
            rows = rows.filter((row) => String(row[key]) >= value)
            return range
          },
          lt: (key: string, value: string) => {
            rows = rows.filter((row) => String(row[key]) < value)
            return range
          },
        }

        return {
          withIndex: (_name: string, select?: (q: typeof range) => unknown) => {
            select?.(range)
            return {
              take: async (limit: number) => rows.slice(0, limit),
              paginate: async ({ cursor }: { cursor: string | null }) => {
                const remaining = rows.filter((row) => cursor === null || String(row._id) > cursor)
                const page = remaining.slice(0, 2)
                const lastId = page.at(-1)?._id

                return {
                  page,
                  isDone: remaining.length <= 2,
                  continueCursor: typeof lastId === 'string' ? lastId : '',
                }
              },
            }
          },
        }
      },
      delete: async (table: string, id: string) => {
        tables[table] = (tables[table] ?? []).filter((row) => row._id !== id)
      },
      patch: async (table: string, id: string, patch: Record<string, unknown>) => {
        const row = tables[table]?.find((item) => item._id === id)

        if (row === undefined) {
          throw new Error('Missing test row')
        }

        for (const [key, value] of Object.entries(patch)) {
          if (value === undefined) {
            Reflect.deleteProperty(row, key)
          } else {
            row[key] = value
          }
        }
      },
    },
    scheduler: {
      runAfter: async (
        _delay: number,
        ref: Parameters<typeof getFunctionName>[0],
        args: Record<string, unknown>,
      ) => {
        scheduled.push({ name: getFunctionName(ref), args })
      },
    },
  } as unknown as MutationCtx

  return { ctx, tables, scheduled }
}

test('range cleanup is half-open, bounded and preserves other processors and ingestion history', async () => {
  const from = '2026-09-28T00:00:00.000Z'
  const to = '2026-09-29T00:00:00.000Z'
  const before = '2026-09-27T00:00:00.000Z'

  const initial = {
    v4_events: Array.from({ length: 19 }, (_, i) => ({
      _id: `event-${i}`,
      scan_at: i === 0 ? before : i === 18 ? to : from,
    })),
    v4_processor_work: [
      ...Array.from({ length: 12 }, (_, i) => ({
        _id: `work-${i}`,
        processor: 'events',
        state: i % 2 ? 'pending' : 'complete',
        scan_at: from,
      })),
      { _id: 'pricing', processor: 'pricing', state: 'complete', scan_at: from },
      { _id: 'listings', processor: 'listings', state: 'complete', scan_at: from },
      { _id: 'stats', processor: 'stats', state: 'complete', scan_at: from },
      { _id: 'outside-before', processor: 'events', state: 'complete', scan_at: before },
      { _id: 'outside-after', processor: 'events', state: 'pending', scan_at: to },
    ],
    v4_scan_ingestions: [{ _id: 'ingestion', scan_at: from }],
  }

  const { ctx, tables, scheduled } = database(initial)
  const run = handler(deleteEvents)
  await rejects(run(ctx, { from_scan_at: to, to_scan_at: from }), /must move forward/)
  await rejects(run(ctx, { from_scan_at: '2026-09-28', to_scan_at: to }), /not canonical/)
  expect(tables).toEqual(initial)

  const args = { from_scan_at: from, to_scan_at: to }
  expect(await run(ctx, args)).toEqual({ done: false, events: 8, work: 0 })

  for (const job of scheduled) {
    expect(job).toEqual({ name: 'v4/cleanup:deleteEvents', args })
    await run(ctx, args)
  }

  expect(scheduled.length).toBeGreaterThan(1)
  expect(tables.v4_events).toEqual([initial.v4_events[0], initial.v4_events[18]])
  expect(tables.v4_processor_work).toEqual(initial.v4_processor_work.slice(12))
  expect(tables.v4_scan_ingestions).toEqual(initial.v4_scan_ingestions)
  expect(await run(ctx, args)).toEqual({ done: true, events: 0, work: 0 })
})

test('one-off cleanup strips optional snapshots, removes completed Listings work and resumes through pages', async () => {
  const initial = {
    v4_processor_work: [
      { _id: 'a', processor: 'events', state: 'complete', previously_known_models: ['model'] },
      { _id: 'b', processor: 'listings', state: 'complete' },
      { _id: 'c', processor: 'pricing', state: 'pending' },
      { _id: 'd', processor: 'events', state: 'pending', previously_known_models: [] },
      { _id: 'e', processor: 'stats', state: 'complete' },
    ],
  }

  const { ctx, tables, scheduled } = database(initial)
  const run = handler(stripLegacyWork)
  expect(await run(ctx, {})).toEqual({ done: false, removed: 1, stripped: 1 })

  for (const job of scheduled) {
    expect(job.name).toBe('v4/cleanup:stripLegacyWork')
    await run(ctx, job.args)
  }

  expect(tables.v4_processor_work).toEqual([
    { _id: 'a', processor: 'events', state: 'complete' },
    initial.v4_processor_work[2],
    { _id: 'd', processor: 'events', state: 'pending' },
    initial.v4_processor_work[4],
  ])

  const pending = database({
    v4_processor_work: [{ _id: 'pending', processor: 'listings', state: 'pending' }],
  })

  await rejects(run(pending.ctx, {}), /Resolve legacy Listings work/)
  expect(pending.scheduled).toEqual([])
  expect(pending.tables.v4_processor_work).toHaveLength(1)
})
