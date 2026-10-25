import { gzipSync, gunzipSync } from 'node:zlib'

import { ConvexHttpClient } from 'convex/browser'
import { getFunctionName } from 'convex/server'
import type { DefaultFunctionArgs } from 'convex/server'
import { expect, vi, test } from 'vitest'

import type { ActionCtx } from '#generated/server'

import { testDouble } from '../doubles.testing'
import { loadMany, store } from './storage'

test('a configured remote read source never redirects local writes', async () => {
  const settings = {
    ORCA_OBJECTS_API_KEY: 'test-key',
    ORCA_OBJECTS_BACKEND: 'convex',
    ORCA_OBJECTS_SOURCE_DEPLOYMENT: 'source-deployment',
  }

  const previous = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]))
  Object.assign(process.env, settings)

  const remote = vi
    .spyOn(ConvexHttpClient.prototype, 'action')
    .mockResolvedValue([{ bytes: Uint8Array.from(gzipSync('source text')).buffer, codec: 'gzip' }])

  const writes: { args: DefaultFunctionArgs; function: string }[] = []
  const identity = { name: 'one', path: 'test' }

  const ctx = testDouble<ActionCtx>({
    meta: { getDeploymentMetadata: async () => ({ name: 'consumer-deployment' }) },
    runMutation: async (ref: Parameters<typeof getFunctionName>[0], args: DefaultFunctionArgs) => {
      writes.push({ args, function: getFunctionName(ref) })
    },
    runQuery: async () => null,
    storage: {
      store: async (blob: Blob) => {
        expect(new TextDecoder().decode(gunzipSync(new Uint8Array(await blob.arrayBuffer())))).toBe(
          'local text',
        )

        return 'local-storage-id'
      },
    },
  })

  try {
    await store(ctx, { ...identity, text: 'local text' })
    expect(remote).not.toHaveBeenCalled()
    expect(writes).toEqual([
      {
        args: {
          locator: {
            ...identity,
            backend: 'convex',
            codec: 'gzip',
            size: 10,
            storage_id: 'local-storage-id',
          },
        },
        function: 'objects/locators:insert',
      },
    ])
    expect(await loadMany(ctx, [identity])).toEqual(['source text'])
    expect(remote).toHaveBeenCalledTimes(1)
  } finally {
    remote.mockRestore()

    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        Reflect.deleteProperty(process.env, key)
      } else {
        process.env[key] = value
      }
    }
  }
})
