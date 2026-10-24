import { rejects } from 'node:assert/strict'

import { afterEach, expect, vi, test } from 'vitest'

import { api } from '#generated/api'

import { setup } from '../harness.testing'

afterEach(() => {
  vi.unstubAllEnvs()
})

test('remote reads accept only the configured API key', async () => {
  vi.stubEnv('ORCA_OBJECTS_API_KEY', 'test-key')
  const t = setup()
  const selection = { atOrAfter: 'a', limit: 1, path: 'scans' }

  expect(
    await t.query(api.objects.remote.namesAtOrAfter, { apiKey: 'test-key', ...selection }),
  ).toEqual([])

  for (const apiKey of ['test-kez', 'test-key-longer', 'test', '']) {
    await rejects(
      t.query(api.objects.remote.namesAtOrAfter, { apiKey, ...selection }),
      /Unauthorized object source request/u,
    )
  }
})
