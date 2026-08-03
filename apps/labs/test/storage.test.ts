import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'

import { buildCorpus } from '../src/corpus/build.ts'
import { corpusCrawls, readCorpusManifest } from '../src/corpus/storage.ts'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true })
    }),
  )
})

describe('sharded corpus storage', () => {
  test('builds and streams deduplicated crawls from a snapshot', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'orca-labs-corpus-'))
    directories.push(directory)
    const snapshotDirectory = path.join(directory, 'snapshot')
    const outputDirectory = path.join(directory, 'corpus')
    const textModel = { output_modalities: ['text'], slug: 'author/model' }
    const bundles = [
      {
        crawl_id: '1',
        data: {
          models: [
            {
              endpoints: [{ id: 'endpoint', model: textModel }],
              model: { ...textModel, name: 'ignored scope model' },
            },
          ],
        },
      },
      { crawl_id: '2', data: { models: [] } },
    ]
    const metadata = []
    for (const [index, bundle] of bundles.entries()) {
      const text = JSON.stringify(bundle)
      const compressed = Bun.gzipSync(text)
      const storageId = `storage-${index}`
      await Bun.write(path.join(snapshotDirectory, '_storage', storageId), compressed)
      metadata.push({
        crawl_id: bundle.crawl_id,
        data: {
          size: { blob: compressed.byteLength, raw: Buffer.byteLength(text) },
          totals: { models: bundle.data.models.length },
        },
        storage_id: storageId,
      })
    }
    await Bun.write(
      path.join(snapshotDirectory, 'snapshot_crawl_archives', 'documents.jsonl'),
      `${metadata.map((item) => JSON.stringify(item)).join('\n')}\n`,
    )

    const result = await Effect.runPromise(
      buildCorpus({
        compressionLevel: 1,
        jobs: 2,
        limit: undefined,
        outputDirectory,
        overwrite: false,
        shardSize: 2,
        snapshotDirectory,
      }),
    )
    expect(result).toMatchObject({ accepted: 1, dropped: 1, shards: 1 })

    const manifest = await Effect.runPromise(readCorpusManifest(outputDirectory))
    expect(manifest.shards).toHaveLength(1)
    expect(manifest.dropReasons).toEqual({ 'empty-catalog': 1 })

    const crawls = [
      ...(await Effect.runPromise(corpusCrawls(outputDirectory).pipe(Stream.runCollect))),
    ]
    expect(crawls).toEqual([
      {
        crawlId: '1',
        endpoints: [{ data: { id: 'endpoint' }, modelSlug: 'author/model' }],
        models: [textModel],
      },
    ])
  })
})
