/* oxlint-disable typescript/no-unsafe-type-assertion -- Minimal Convex context doubles exercise the registered preview initializer without scheduling live work. */
import { expect, test } from 'bun:test'

import { getFunctionName } from 'convex/server'

import type { MutationCtx } from './_generated/server'
import init from './init'

test('preview init schedules a short V4 baseline, then resumes without resetting it', async () => {
  let latest: { scan_at: string } | null = null
  const calls: { delay: number; name: string; args: { start_at?: string } }[] = []
  const query = {
    withIndex: () => query,
    order: () => query,
    first: async () => latest,
  }
  const ctx = {
    db: { query: () => query },
    scheduler: {
      runAfter: async (
        delay: number,
        ref: Parameters<typeof getFunctionName>[0],
        args: { start_at?: string },
      ) => {
        calls.push({ delay, name: getFunctionName(ref), args })
      },
    },
  } as unknown as MutationCtx
  const handler = (
    init as unknown as { _handler: (ctx: MutationCtx, args: object) => Promise<null> }
  )._handler

  const before = Date.now() - 2 * 86_400_000
  await handler(ctx, {})
  const after = Date.now() - 2 * 86_400_000
  expect(calls[0]).toMatchObject({ delay: 0, name: 'v4/routine:run' })
  const start = Date.parse(calls[0].args.start_at ?? '')
  expect(start).toBeGreaterThanOrEqual(before)
  expect(start).toBeLessThanOrEqual(after)

  latest = { scan_at: '2026-09-26T15:40:04.139Z' }
  await handler(ctx, {})
  expect(calls).toHaveLength(2)
  expect(calls[1]).toEqual({ delay: 0, name: 'v4/routine:run', args: {} })
})
