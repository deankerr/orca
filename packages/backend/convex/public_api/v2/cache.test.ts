/* oxlint-disable typescript/no-unsafe-type-assertion -- Minimal Convex contexts exercise cache transitions without a deployment. */
import { expect, spyOn, test } from 'bun:test'

import type { RegisteredMutation } from 'convex/server'

import type { Doc, Id } from '#generated/dataModel'
import type { ActionCtx, MutationCtx } from '#generated/server'

import * as objects from '../../objects'
import { refresh, replaceIfNewer } from './cache'
import * as snapshot from './snapshot'
import type { PUBLIC_API_V2_CACHE_TABLE } from './table'

test('refresh rebuilds legacy or older captures and skips an unchanged capture', async () => {
  const scanAt = '2026-10-02T10:40:04.272Z'
  const discovery = spyOn(objects, 'namesAtOrAfter').mockResolvedValue([`scan.${scanAt}.jsonl`])

  const build = spyOn(snapshot, 'buildSnapshot').mockResolvedValue({
    updated_at: scanAt,
    models: [],
  })

  const logs = spyOn(console, 'log').mockImplementation(() => {})
  let cachedScanAt: string | undefined
  const replacements: unknown[] = []

  const ctx = {
    runQuery: async () => ({ scan_at: cachedScanAt, scan_id: 'ignored' }),
    runMutation: async (_ref: unknown, args: unknown) => {
      replacements.push(args)
      return null
    },
    storage: { store: async () => 'new-blob' },
  } as unknown as ActionCtx

  const handler = (
    refresh as unknown as {
      _handler: (ctx: ActionCtx, args: Record<string, never>) => Promise<null>
    }
  )._handler

  try {
    for (const key of [undefined, '2026-10-01T10:40:04.272Z', scanAt]) {
      cachedScanAt = key
      replacements.length = 0
      build.mockClear()
      await handler(ctx, {})

      expect(discovery).toHaveBeenLastCalledWith(ctx, {
        path: 'scans',
        atOrAfter: key === undefined ? '' : `scan.${key}.jsonl`,
        limit: 1,
        order: 'desc',
      })

      expect(build).toHaveBeenCalledTimes(key === scanAt ? 0 : 1)
      expect(replacements).toHaveLength(key === scanAt ? 0 : 1)

      if (key !== scanAt) {
        expect(replacements[0]).toMatchObject({ scan_at: scanAt, storage_id: 'new-blob' })
        expect(replacements[0]).not.toHaveProperty('scan_id')
      }
    }
  } finally {
    discovery.mockRestore()
    build.mockRestore()
    logs.mockRestore()
  }
})

test('cache replacement upgrades legacy rows and rejects equal or older scans atomically', async () => {
  const oldBlob = 'old-blob' as Id<'_storage'>
  const newBlob = 'new-blob' as Id<'_storage'>

  let existing: Doc<typeof PUBLIC_API_V2_CACHE_TABLE> | null = {
    _id: 'cache-row' as Id<typeof PUBLIC_API_V2_CACHE_TABLE>,
    _creationTime: 0,
    content_type: 'application/json',
    storage_id: oldBlob,
    size: 1,
    scan_id: 'scan.2099-01-01T00:00:00.000Z.jsonl',
  }

  let writes = 0

  const ctx = {
    db: {
      query: () => ({ order: () => ({ first: async () => existing }) }),
      delete: async () => {
        writes += 1
      },
      insert: async () => {
        writes += 1
      },
    },
  } as unknown as MutationCtx

  const handler = mutationHandler(replaceIfNewer)

  const args = {
    content_type: 'application/json',
    storage_id: newBlob,
    size: 2,
    scan_at: '2026-10-02T10:40:04.272Z',
  }

  for (const scanAt of [undefined, '2026-10-01T10:40:04.272Z']) {
    existing.scan_at = scanAt
    writes = 0
    expect(await handler(ctx, args)).toBe(oldBlob)
    expect(writes).toBe(2)
  }

  existing.scan_at = args.scan_at
  writes = 0
  expect(await handler(ctx, args)).toBe(newBlob)
  expect(await handler(ctx, { ...args, scan_at: '2026-10-02T09:40:04.272Z' })).toBe(newBlob)
  expect(writes).toBe(0)

  expect(await handler(ctx, { ...args, scan_at: '2026-10-02T11:40:04.272Z' })).toBe(oldBlob)
  expect(writes).toBe(2)

  existing = null
  writes = 0
  expect(await handler(ctx, args)).toBeNull()
  expect(writes).toBe(1)
})

function mutationHandler<Args extends Record<string, unknown>, Result>(
  fn: RegisteredMutation<'internal', Args, Result>,
) {
  return (fn as unknown as { _handler: (ctx: MutationCtx, args: Args) => Promise<Result> })._handler
}
