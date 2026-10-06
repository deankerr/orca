/* oxlint-disable typescript/no-unsafe-type-assertion -- The context implements only the storage operations exercised by this test. */
import { expect, spyOn, test } from 'bun:test'

import { ConvexHttpClient } from 'convex/browser'
import { getFunctionName } from 'convex/server'

import type { ActionCtx } from '#generated/server'

import { loadMany, store } from './storage'

test('a configured remote read source never redirects local writes', async () => {
  const settings = {
    ORCA_OBJECTS_BACKEND: 'convex',
    ORCA_OBJECTS_SOURCE_DEPLOYMENT: 'source-deployment',
    ORCA_OBJECTS_API_KEY: 'test-key',
  }
  const previous = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]))
  Object.assign(process.env, settings)

  const remote = spyOn(ConvexHttpClient.prototype, 'action').mockResolvedValue([
    { codec: 'gzip', bytes: Bun.gzipSync('source text').buffer },
  ])
  const writes: unknown[] = []
  const identity = { path: 'test', name: 'one' }
  const ctx = {
    meta: { getDeploymentMetadata: async () => ({ name: 'consumer-deployment' }) },
    runQuery: async () => null,
    runMutation: async (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
      writes.push({ function: getFunctionName(ref), args })
    },
    storage: {
      store: async (blob: Blob) => {
        expect(new TextDecoder().decode(Bun.gunzipSync(await blob.arrayBuffer()))).toBe(
          'local text',
        )
        return 'local-storage-id'
      },
    },
  } as unknown as ActionCtx

  try {
    await store(ctx, { ...identity, text: 'local text' })
    expect(remote).not.toHaveBeenCalled()
    expect(writes).toEqual([
      {
        function: 'objects/locators:insert',
        args: {
          locator: {
            ...identity,
            backend: 'convex',
            storage_id: 'local-storage-id',
            codec: 'gzip',
            size: 10,
          },
        },
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
