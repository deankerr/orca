import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import * as Effect from 'effect/Effect'

import { validateExtractedSnapshot } from '../src/snapshot.ts'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true })
    }),
  )
})

const extractedSnapshot = async (storageIds: ReadonlyArray<string>) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'orca-labs-snapshot-'))
  directories.push(directory)
  const metadata = storageIds.map((storageId, index) => ({
    crawl_id: String(index),
    data: { size: { blob: 1, raw: 1 }, totals: {} },
    storage_id: storageId,
  }))
  await Bun.write(
    path.join(directory, 'snapshot_crawl_archives', 'documents.jsonl'),
    `${metadata.map((row) => JSON.stringify(row)).join('\n')}\n`,
  )
  return directory
}

describe('snapshot extraction validation', () => {
  test('accepts every referenced storage blob and allows export metadata', async () => {
    const directory = await extractedSnapshot(['blob-a', 'blob-b'])
    await Bun.write(path.join(directory, '_storage', 'blob-a'), 'a')
    await Bun.write(path.join(directory, '_storage', 'blob-b'), 'b')
    await Bun.write(path.join(directory, '_storage', 'documents.jsonl'), '{}\n')

    const validation = await Effect.runPromise(validateExtractedSnapshot(directory))

    expect(validation).toEqual({
      crawls: 2,
      storageEntries: 3,
    })
  })

  test('rejects an incomplete extraction', async () => {
    const directory = await extractedSnapshot(['blob-a', 'blob-b'])
    await Bun.write(path.join(directory, '_storage', 'blob-a'), 'a')

    const exit = await Effect.runPromiseExit(validateExtractedSnapshot(directory))

    expect(exit.toString()).toContain(
      'extracted snapshot is missing 1 referenced storage blobs: blob-b',
    )
  })
})
