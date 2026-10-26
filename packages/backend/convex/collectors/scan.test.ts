import { getFunctionName } from 'convex/server'
/* oxlint-disable typescript/no-unsafe-type-assertion -- Minimal contexts verify cron admission and manual capture without live storage or upstream requests. */
import { expect, vi, test } from 'vitest'

import type { ActionCtx, MutationCtx } from '#generated/server'
import * as scans from '#scans'

import { testDouble } from '../doubles.testing'

test('scan flag gates cron admission while manual capture remains available', async () => {
  const previous = process.env.ORCA_SCAN_CRON_ENABLED
  const fetch = vi.fn(async () => Response.json({ data: [] }))
  vi.stubGlobal('fetch', fetch)
  const store = vi.spyOn(scans, 'store').mockResolvedValue(undefined)
  const { run, scheduled } = await import('./scan')

  const scheduledHandler = testDouble<{
    _handler: (ctx: MutationCtx, args: object) => Promise<null>
  }>(scheduled)._handler

  const runHandler = testDouble<{ _handler: (ctx: ActionCtx, args: object) => Promise<null> }>(
    run,
  )._handler

  const calls: string[] = []

  const ctx = testDouble<MutationCtx>({
    scheduler: {
      runAfter: async (_delay: number, ref: Parameters<typeof getFunctionName>[0]) => {
        calls.push(getFunctionName(ref))
      },
    },
  })

  try {
    delete process.env.ORCA_SCAN_CRON_ENABLED
    await scheduledHandler(ctx, {})
    process.env.ORCA_SCAN_CRON_ENABLED = 'false'
    await scheduledHandler(ctx, {})
    expect(calls).toEqual([])

    process.env.ORCA_SCAN_CRON_ENABLED = 'true'
    await scheduledHandler(ctx, {})
    expect(calls).toEqual(['collectors/scan:run'])

    process.env.ORCA_SCAN_CRON_ENABLED = 'false'
    await runHandler({} as ActionCtx, {})
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(store).toHaveBeenCalledTimes(1)
    expect(store.mock.calls[0]?.[1]).toMatchObject({ entries: [] })
  } finally {
    vi.unstubAllGlobals()
    store.mockRestore()

    if (previous === undefined) {
      delete process.env.ORCA_SCAN_CRON_ENABLED
    } else {
      process.env.ORCA_SCAN_CRON_ENABLED = previous
    }
  }
})
