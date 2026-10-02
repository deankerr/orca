/* oxlint-disable typescript/no-unsafe-type-assertion -- Minimal Convex contexts exercise cache transitions without a deployment. */
import { expect, spyOn, test } from 'bun:test'

import type { RegisteredMutation } from 'convex/server'

import type { Doc, Id } from '../../_generated/dataModel'
import type { ActionCtx, MutationCtx } from '../../_generated/server'
import * as objects from '../../objects'
import { replaceIfNewer } from './cache'
import { latestScanId } from './snapshot'

test('scan discovery handles empty storage, legacy caches, unchanged scans and multiple pages', async () => {
  const names = Array.from(
    { length: 205 },
    (_, index) => `scan.${String(index).padStart(3, '0')}.jsonl`,
  )
  const discovery = spyOn(objects, 'namesAtOrAfter').mockImplementation(async (_, args) =>
    names.filter((name) => name >= args.atOrAfter).slice(0, args.limit),
  )

  try {
    const ctx = {} as ActionCtx
    expect(await latestScanId(ctx)).toBe(names.at(-1) ?? null)
    expect(discovery).toHaveBeenCalledTimes(3)
    discovery.mockClear()
    expect(await latestScanId(ctx, names.at(-1))).toBe(names.at(-1) ?? null)
    expect(discovery).toHaveBeenCalledTimes(1)
    expect(await latestScanId(ctx, names[200])).toBe(names.at(-1) ?? null)
    discovery.mockResolvedValue([])
    expect(await latestScanId(ctx)).toBeNull()
  } finally {
    discovery.mockRestore()
  }
})

test('cache replacement upgrades legacy rows and rejects equal or older scans atomically', async () => {
  const oldBlob = 'old-blob' as Id<'_storage'>
  const newBlob = 'new-blob' as Id<'_storage'>
  let existing: Doc<'public_api_v2_cache'> | null = {
    _id: 'cache-row' as Id<'public_api_v2_cache'>,
    _creationTime: 0,
    content_type: 'application/json',
    storage_id: oldBlob,
    size: 1,
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
    scan_id: 'scan.2026-10-02T10:40:04.272Z.jsonl',
  }

  expect(await handler(ctx, args)).toBe(oldBlob)
  expect(writes).toBe(2)

  existing.scan_id = args.scan_id
  writes = 0
  expect(await handler(ctx, args)).toBe(newBlob)
  expect(await handler(ctx, { ...args, scan_id: 'scan.2026-10-02T09:40:04.272Z.jsonl' })).toBe(
    newBlob,
  )
  expect(writes).toBe(0)

  expect(await handler(ctx, { ...args, scan_id: 'scan.2026-10-02T11:40:04.272Z.jsonl' })).toBe(
    oldBlob,
  )
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
