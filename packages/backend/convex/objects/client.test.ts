import { rejects } from 'node:assert/strict'
import { gzipSync } from 'node:zlib'

import { ConvexHttpClient } from 'convex/browser'
import { expect, vi, test } from 'vitest'

import type { ActionCtx } from '#generated/server'

import { testDouble } from '../doubles.testing'
import { connect } from './client'
import { loadMany } from './storage'

test('standalone and deployment readers share ordered remote batches and propagate source failures', async () => {
  const savedSource = process.env.ORCA_OBJECTS_SOURCE_DEPLOYMENT
  const savedKey = process.env.ORCA_OBJECTS_API_KEY
  process.env.ORCA_OBJECTS_SOURCE_DEPLOYMENT = 'source-deployment'
  process.env.ORCA_OBJECTS_API_KEY = 'test-key'

  const ctx = testDouble<ActionCtx>({
    meta: { getDeploymentMetadata: async () => ({ name: 'consumer-deployment' }) },
  })

  const identities = [
    { name: 'some.metadata.1', path: 'arbitrary' },
    { name: 'missing', path: 'other' },
  ]

  const action = vi
    .spyOn(ConvexHttpClient.prototype, 'action')
    .mockResolvedValue([
      { bytes: Uint8Array.from(gzipSync('logical text ✓')).buffer, codec: 'gzip' },
      null,
    ])

  const standalone = connect({ apiKey: 'test-key', deployment: 'source-deployment' })

  try {
    expect(await standalone.loadMany(identities)).toEqual(['logical text ✓', null])
    expect(await loadMany(ctx, identities)).toEqual(['logical text ✓', null])

    for (const [, args] of action.mock.calls) {
      expect(args).toEqual({ apiKey: 'test-key', objects: identities })
    }

    action.mockResolvedValue([null])
    await rejects(standalone.loadMany(identities), /invalid batch/u)
    await rejects(loadMany(ctx, identities), /invalid batch/u)

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
