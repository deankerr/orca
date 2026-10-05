/* oxlint-disable typescript/no-unsafe-type-assertion -- Remote reads only use deployment metadata from this context. */
import { expect, spyOn, test } from 'bun:test'
import { rejects } from 'node:assert/strict'

import { ConvexHttpClient } from 'convex/browser'

import type { ActionCtx } from '#generated/server'

import { connect } from './client'
import { loadMany } from './storage'

test('standalone and deployment readers share ordered remote batches and propagate source failures', async () => {
  const savedSource = process.env.ORCA_OBJECTS_SOURCE_DEPLOYMENT
  const savedKey = process.env.ORCA_OBJECTS_API_KEY
  process.env.ORCA_OBJECTS_SOURCE_DEPLOYMENT = 'source-deployment'
  process.env.ORCA_OBJECTS_API_KEY = 'test-key'

  const ctx = {
    meta: { getDeploymentMetadata: async () => ({ name: 'consumer-deployment' }) },
  } as unknown as ActionCtx

  const identities = [
    { path: 'arbitrary', name: 'some.metadata.1' },
    { path: 'other', name: 'missing' },
  ]

  const action = spyOn(ConvexHttpClient.prototype, 'action').mockResolvedValue([
    { codec: 'gzip', bytes: Bun.gzipSync('logical text ✓').buffer },
    null,
  ])

  const standalone = connect({ deployment: 'source-deployment', apiKey: 'test-key' })

  try {
    expect(await standalone.loadMany(identities)).toEqual(['logical text ✓', null])
    expect(await loadMany(ctx, identities)).toEqual(['logical text ✓', null])
    for (const [, args] of action.mock.calls) {
      expect(args).toEqual({ apiKey: 'test-key', objects: identities })
    }

    action.mockResolvedValue([null])
    await rejects(standalone.loadMany(identities), /invalid batch/)
    await rejects(loadMany(ctx, identities), /invalid batch/)

    const unavailable = new Error('Source unavailable')
    action.mockRejectedValue(unavailable)
    await rejects(standalone.loadMany(identities), (error) => error === unavailable)
    await rejects(loadMany(ctx, identities), (error) => error === unavailable)
  } finally {
    action.mockRestore()

    if (savedSource === undefined) {
      delete process.env.ORCA_OBJECTS_SOURCE_DEPLOYMENT
    } else {
      process.env.ORCA_OBJECTS_SOURCE_DEPLOYMENT = savedSource
    }

    if (savedKey === undefined) {
      delete process.env.ORCA_OBJECTS_API_KEY
    } else {
      process.env.ORCA_OBJECTS_API_KEY = savedKey
    }
  }
})
