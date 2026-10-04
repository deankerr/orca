/* oxlint-disable typescript/no-unsafe-type-assertion -- Only the observation clock is used from the query context. */
import { expect, spyOn, test } from 'bun:test'
import { rejects } from 'node:assert/strict'

import type { QueryCtx } from '../_generated/server'
import * as observation from '../clock'
import { cappedCutoff } from './pagination'

test('history uses the parsed external cutoff before comparing it with the stored clock', async () => {
  const ctx = {} as QueryCtx
  const clock = spyOn(observation, 'clock').mockResolvedValue('2026-10-03T05:00:00.000Z')

  try {
    expect(await cappedCutoff(ctx, '2026-10-03T10:00:00+10:00')).toBe('2026-10-03T00:00:00.000Z')
    expect(await cappedCutoff(ctx, '2026-10-03T10:00:00Z')).toBe('2026-10-03T05:00:00.000Z')
    expect(await cappedCutoff(ctx)).toBe('2026-10-03T05:00:00.000Z')
    await rejects(cappedCutoff(ctx, '2026-02-30T00:00:00Z'))
    clock.mockResolvedValue(null)
    expect(await cappedCutoff(ctx, '2026-10-03T00:00:00Z')).toBeNull()
  } finally {
    clock.mockRestore()
  }
})
