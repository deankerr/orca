/* oxlint-disable typescript/no-unsafe-type-assertion -- Minimal action contexts exercise orchestration without fetching scans or sending Discord messages. */
import { expect, spyOn, test } from 'bun:test'
import { rejects } from 'node:assert/strict'

import { getFunctionName } from 'convex/server'
import type { RegisteredAction, RegisteredMutation } from 'convex/server'

import type { Id } from './_generated/dataModel'
import type { ActionCtx, MutationCtx } from './_generated/server'
import * as stats from './catalog/stats/ingest'
import * as acceptance from './ingestion/release'
import type { WorkId } from './ingestion/work'
import { events as retryEvents } from './retry'
import { commitIngestion, run } from './routine'
import type { Scan } from './scan'
import * as load from './scan'

function handler<Args extends Record<string, unknown>, Result>(
  fn: RegisteredAction<'internal', Args, Result>,
) {
  return (fn as unknown as { _handler: (ctx: ActionCtx, args: Args) => Promise<Result> })._handler
}

test('routine validates and normalizes operator start_at before selecting scans', async () => {
  const nextPair = spyOn(load, 'loadNextPair').mockResolvedValue(null)
  let scanAt: string | null = null
  const ctx = { runQuery: async () => scanAt } as unknown as ActionCtx

  try {
    for (const start_at of ['2026-10-03', '2026-10-03T10:00:00+10:00']) {
      await rejects(handler(run)(ctx, { start_at }), /Baseline requires two captures/)
      expect(nextPair).toHaveBeenLastCalledWith(ctx, '2026-10-03T00:00:00.000Z')
    }

    nextPair.mockClear()

    for (const start_at of ['yesterday', '2026-02-30', '2026-10-03T00:00:00']) {
      await rejects(handler(run)(ctx, { start_at }))
    }

    expect(nextPair).not.toHaveBeenCalled()

    scanAt = '2026-10-03T00:00:00.000Z'
    expect(await handler(run)(ctx, {})).toBeNull()
    expect(nextPair).toHaveBeenLastCalledWith(ctx, scanAt)
  } finally {
    nextPair.mockRestore()
  }
})

test('only successful fresh routine events schedule enabled Discord broadcasts; retries never broadcast', async () => {
  const scan = (scan_at: string): Scan => ({
    scan_at,
    models: new Map(),
    providers: new Map(),
    endpoints: new Map(),
  })

  const pair = {
    previous: scan('2026-09-28T00:00:00.000Z'),
    next: scan('2026-09-28T01:00:00.000Z'),
  }

  const nextPair = spyOn(load, 'loadNextPair').mockResolvedValue(pair)
  const exactPair = spyOn(load, 'loadPair').mockResolvedValue(pair)
  const errors = spyOn(console, 'error').mockImplementation(() => {})
  const oldEnabled = process.env.ORCA_DISCORD_ALERTS_ENABLED
  const calls: string[] = []
  let eventIds = ['fresh-event']
  let failEvents = false
  let failSchedule = false
  let duplicate = false

  const ctx = {
    runQuery: async (ref: Parameters<typeof getFunctionName>[0]) =>
      getFunctionName(ref) === 'clock:get'
        ? pair.previous.scan_at
        : { from_scan_at: pair.previous.scan_at, scan_at: pair.next.scan_at },
    runMutation: async (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
      const name = getFunctionName(ref)
      calls.push(name)

      if (name === 'routine:commitIngestion') {
        expect(args).toMatchObject({ scan_at: pair.next.scan_at, stats: [] })
        return duplicate ? null : { events: 'event-work', pricing: 'pricing-work' }
      }

      if (name === 'events/ingest:commit') {
        if (failEvents) {
          throw new Error('Event processing failed')
        }

        return eventIds
      }

      return null
    },
    scheduler: {
      runAfter: async (
        delay: number,
        ref: Parameters<typeof getFunctionName>[0],
        args: unknown,
      ) => {
        const name = getFunctionName(ref)
        calls.push(name)
        expect(delay).toBe(0)

        if (name === 'alerts/discord/delivery:broadcast') {
          expect(args).toEqual({ event_ids: ['fresh-event'] })

          if (failSchedule) {
            throw new Error('Scheduling failed')
          }
        }
      },
    },
  } as unknown as ActionCtx

  try {
    for (const mode of [
      'disabled',
      'empty',
      'event-error',
      'schedule-error',
      'live',
      'duplicate',
    ]) {
      calls.length = 0
      process.env.ORCA_DISCORD_ALERTS_ENABLED = mode === 'disabled' ? 'false' : 'true'
      eventIds = mode === 'empty' ? [] : ['fresh-event']
      failEvents = mode === 'event-error'
      failSchedule = mode === 'schedule-error'
      duplicate = mode === 'duplicate'
      await handler(run)(ctx, {})

      const broadcasts = calls.filter((name) => name === 'alerts/discord/delivery:broadcast')
      expect(broadcasts).toHaveLength(['live', 'schedule-error'].includes(mode) ? 1 : 0)

      if (broadcasts.length > 0) {
        expect(calls.indexOf('events/ingest:commit')).toBeLessThan(
          calls.indexOf('alerts/discord/delivery:broadcast'),
        )
      }

      if (!duplicate) {
        expect(calls).not.toContain('catalog/stats/ingest:publish')
        expect(calls.at(-1)).toBe('routine:run')
      }
    }

    calls.length = 0
    await handler(retryEvents)(ctx, { work_id: 'event-work' as WorkId })
    expect(calls).toEqual(['events/ingest:commit'])
  } finally {
    nextPair.mockRestore()
    exactPair.mockRestore()
    errors.mockRestore()

    if (oldEnabled === undefined) {
      delete process.env.ORCA_DISCORD_ALERTS_ENABLED
    } else {
      process.env.ORCA_DISCORD_ALERTS_ENABLED = oldEnabled
    }
  }
})

test('acceptance writes stats in its mutation and propagates snapshot failures', async () => {
  const release = spyOn(acceptance, 'release').mockResolvedValue(
    'ingestion' as Id<'v4_scan_ingestions'>,
  )
  const createWork = spyOn(acceptance, 'createWork').mockResolvedValue(
    'work' as Id<'v4_processor_work'>,
  )
  const args = {
    from_scan_at: '2026-10-03T00:00:00.000Z',
    scan_at: '2026-10-03T01:00:00.000Z',
    models: [],
    providers: [],
    endpoints: [],
    listings: [],
    stats: stats.prepare([{ id: 'endpoint', stats: { p50_throughput: 42 } }]),
  }
  let existing: { _id: string } | null = null
  let fail = false
  const writes: unknown[] = []
  const write = async (...values: unknown[]) => {
    if (fail) {
      throw new Error('Snapshot write failed')
    }

    writes.push(values)
  }
  const ctx = {
    db: {
      query: (table: string) => {
        expect(table).toBe('v4_current_stats_snapshot')
        return { unique: async () => existing }
      },
      insert: write,
      replace: write,
    },
  } as unknown as MutationCtx
  const invoke = <Args extends Record<string, unknown>, Result>(
    fn: RegisteredMutation<'internal', Args, Result>,
  ) => (fn as unknown as { _handler: (ctx: MutationCtx, args: Args) => Promise<Result> })._handler

  try {
    const snapshot = {
      scan_at: args.scan_at,
      rows: [{ endpoint_id: 'endpoint', p50_throughput: 42 }],
    }
    await invoke(commitIngestion)(ctx, args)
    expect(writes).toEqual([['v4_current_stats_snapshot', snapshot]])

    existing = { _id: 'snapshot' }
    await invoke(commitIngestion)(ctx, args)
    expect(writes.at(-1)).toEqual(['v4_current_stats_snapshot', 'snapshot', snapshot])

    fail = true
    createWork.mockClear()
    await rejects(invoke(commitIngestion)(ctx, args), /Snapshot write failed/)
    expect(createWork).not.toHaveBeenCalled()

    release.mockResolvedValue(null)
    expect(await invoke(commitIngestion)(ctx, args)).toBeNull()
    expect(writes).toHaveLength(2)
  } finally {
    release.mockRestore()
    createWork.mockRestore()
  }
})
