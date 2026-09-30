/* oxlint-disable typescript/no-unsafe-type-assertion -- Minimal action contexts exercise orchestration without fetching scans or sending Discord messages. */
import { expect, spyOn, test } from 'bun:test'

import { getFunctionName } from 'convex/server'
import type { RegisteredAction } from 'convex/server'

import type { ActionCtx } from '../_generated/server'
import type { WorkId } from './ingestion/work'
import { events as retryEvents } from './retry'
import { run } from './routine'
import type { Scan } from './scan/extract'
import * as load from './scan/load'

function handler<Args extends Record<string, unknown>, Result>(
  fn: RegisteredAction<'internal', Args, Result>,
) {
  return (fn as unknown as { _handler: (ctx: ActionCtx, args: Args) => Promise<Result> })._handler
}

test('only successful fresh routine events schedule the enabled preview; retries never broadcast', async () => {
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
  const oldEnabled = process.env.ORCA_DISCORD_PREVIEW_ENABLED
  const calls: string[] = []
  let eventIds = ['fresh-event']
  let failEvents = false
  let failSchedule = false
  let duplicate = false

  const ctx = {
    runQuery: async (ref: Parameters<typeof getFunctionName>[0]) =>
      getFunctionName(ref) === 'v4/clock:get'
        ? pair.previous.scan_at
        : { from_scan_at: pair.previous.scan_at, scan_at: pair.next.scan_at },
    runMutation: async (ref: Parameters<typeof getFunctionName>[0]) => {
      const name = getFunctionName(ref)
      calls.push(name)

      if (name === 'v4/routine:commitIngestion') {
        return duplicate ? null : { events: 'event-work', pricing: 'pricing-work' }
      }

      if (name === 'v4/events/ingest:commit') {
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

        if (name === 'v4/discord:broadcast') {
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
      process.env.ORCA_DISCORD_PREVIEW_ENABLED = mode === 'disabled' ? 'false' : 'true'
      eventIds = mode === 'empty' ? [] : ['fresh-event']
      failEvents = mode === 'event-error'
      failSchedule = mode === 'schedule-error'
      duplicate = mode === 'duplicate'
      await handler(run)(ctx, {})

      const broadcasts = calls.filter((name) => name === 'v4/discord:broadcast')
      expect(broadcasts).toHaveLength(['live', 'schedule-error'].includes(mode) ? 1 : 0)

      if (broadcasts.length > 0) {
        expect(calls.indexOf('v4/events/ingest:commit')).toBeLessThan(
          calls.indexOf('v4/discord:broadcast'),
        )
      }

      if (!duplicate) {
        expect(calls).toContain('v4/stats/ingest:publish')
        expect(calls.at(-1)).toBe('v4/routine:run')
      }
    }

    calls.length = 0
    await handler(retryEvents)(ctx, { work_id: 'event-work' as WorkId })
    expect(calls).toEqual(['v4/events/ingest:commit'])
  } finally {
    nextPair.mockRestore()
    exactPair.mockRestore()
    errors.mockRestore()

    if (oldEnabled === undefined) {
      delete process.env.ORCA_DISCORD_PREVIEW_ENABLED
    } else {
      process.env.ORCA_DISCORD_PREVIEW_ENABLED = oldEnabled
    }
  }
})
