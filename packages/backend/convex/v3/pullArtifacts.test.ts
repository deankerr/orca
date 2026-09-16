/* eslint-disable typescript/no-unsafe-type-assertion -- Minimal action double and access to Convex runtime handler. */
import { expect, spyOn, test } from 'bun:test'
import assert from 'node:assert/strict'

import { gunzipSync } from 'fflate'

import type { ActionCtx } from '../_generated/server'
import { run } from './pullArtifacts'

test('copies named artifacts, skips existing objects, and rejects failed downloads', async () => {
  const previousSource = process.env.ORCA_PULL_SOURCE_URL
  const previousBackend = process.env.ORCA_OBJECTS_BACKEND
  const stored = new Set(['existing.jsonl'])
  const bodies: string[] = []
  const download = spyOn(globalThis, 'fetch').mockResolvedValue(new Response('artifact contents'))
  const ctx = {
    runQuery: async (_ref: unknown, { name }: { name: string }) =>
      stored.has(name) ? { backend: 'convex' } : null,
    storage: {
      store: async (blob: Blob) => {
        bodies.push(new TextDecoder().decode(gunzipSync(new Uint8Array(await blob.arrayBuffer()))))
        return 'storage-id'
      },
    },
    runMutation: async (
      _ref: unknown,
      { locator }: { locator: { path: string; name: string } },
    ) => {
      expect(locator.path).toBe('scans')
      stored.add(locator.name)
      return null
    },
  }
  const handler = (
    run as unknown as {
      _handler: (ctx: ActionCtx, args: { filenames: string[] }) => Promise<null>
    }
  )._handler

  try {
    process.env.ORCA_PULL_SOURCE_URL = 'https://example.convex.cloud'
    process.env.ORCA_OBJECTS_BACKEND = 'convex'
    await handler(ctx as unknown as ActionCtx, {
      filenames: ['existing.jsonl', 'scan.new.jsonl', 'scan.new.jsonl'],
    })
    expect(download).toHaveBeenCalledTimes(1)
    expect(download.mock.calls[0]?.[0]).toEqual(
      new URL('https://example.convex.site/objects?path=scans&name=scan.new.jsonl'),
    )
    expect(bodies).toEqual(['artifact contents'])
    expect(stored.has('scan.new.jsonl')).toBe(true)

    download.mockResolvedValueOnce(new Response(null, { status: 404 }))
    await assert.rejects(
      handler(ctx as unknown as ActionCtx, { filenames: ['missing.jsonl'] }),
      /Artifact pull failed for missing.jsonl: 404/,
    )
    expect(stored.has('missing.jsonl')).toBe(false)
  } finally {
    download.mockRestore()
    if (previousSource === undefined) {
      delete process.env.ORCA_PULL_SOURCE_URL
    } else {
      process.env.ORCA_PULL_SOURCE_URL = previousSource
    }
    if (previousBackend === undefined) {
      delete process.env.ORCA_OBJECTS_BACKEND
    } else {
      process.env.ORCA_OBJECTS_BACKEND = previousBackend
    }
  }
})
