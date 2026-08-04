import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import * as BunServices from '@effect/platform-bun/BunServices'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'

import { encodeGzipBundle } from '../src/bundle-archive/encoding.ts'
import { importSnapshotBundles } from '../src/bundle-archive/import-snapshot.ts'
import { appendBundle, bundleArchive, verifyBundleArchive } from '../src/bundle-archive/storage.ts'
import { importBundleArchive } from '../src/programs/import-bundle-archive.program.ts'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true })
    }),
  )
})

describe('raw bundle archive', () => {
  test('losslessly imports and chronologically streams snapshot bundles', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'orca-labs-raw-archive-'))
    directories.push(directory)
    const snapshotDirectory = path.join(directory, 'snapshot')
    const outputPath = path.join(directory, 'bundles.sqlite')
    const sources = [
      { crawlId: '20', text: '{\n  "crawl_id": "20", "data": {"models": []}\n}\n' },
      { crawlId: '10', text: '{"crawl_id":"10","data":{"models":[]}}' },
    ] as const
    const metadata = []
    for (const [index, source] of sources.entries()) {
      const compressed = Bun.gzipSync(source.text)
      const storageId = `storage-${index}`
      await Bun.write(path.join(snapshotDirectory, '_storage', storageId), compressed)
      metadata.push({
        crawl_id: source.crawlId,
        data: {
          size: { blob: compressed.byteLength, raw: Buffer.byteLength(source.text) },
          totals: { models: 0 },
        },
        storage_id: storageId,
      })
    }
    await Bun.write(
      path.join(snapshotDirectory, 'snapshot_crawl_archives', 'documents.jsonl'),
      `${metadata.map((item) => JSON.stringify(item)).join('\n')}\n`,
    )

    const imported = await Effect.runPromise(
      importSnapshotBundles({
        compressionLevel: 1,
        limit: 1,
        outputPath,
        snapshotDirectory,
      }),
    )
    expect(imported.inserted).toBe(1)

    const overwrite = await Effect.runPromiseExit(
      importSnapshotBundles({ compressionLevel: 1, outputPath, snapshotDirectory }),
    )
    expect(overwrite._tag).toBe('Failure')

    await Bun.write(
      path.join(directory, 'run.log.jsonl'),
      `${JSON.stringify({ annotations: { input: snapshotDirectory }, message: 'input ready' })}\n`,
    )
    await Bun.write(
      path.join(directory, 'report.json'),
      `${JSON.stringify({
        format: 'orca-labs-run-report',
        formatVersion: 1,
        inputs: [],
        metrics: {},
        options: {
          attempt: 1,
          compressionLevel: 1,
          limit: null,
        },
        program: 'archive.import',
        runId: 'interrupted-import',
        startedAt: '2026-08-04T00:00:00.000Z',
        status: 'running',
      })}\n`,
    )

    const changedPolicy = await Effect.runPromiseExit(
      importBundleArchive({
        compressionLevel: 2,
        outputDirectory: directory,
        resume: true,
        workDirectory: path.join(directory, 'work'),
      }).pipe(Effect.provide(BunServices.layer)),
    )
    expect(changedPolicy._tag).toBe('Failure')

    const resumed = await Effect.runPromise(
      importBundleArchive({
        outputDirectory: directory,
        resume: true,
        workDirectory: path.join(directory, 'work'),
      }).pipe(Effect.provide(BunServices.layer)),
    )
    expect(resumed.imported).toMatchObject({ completed: 2, existing: 1, inserted: 1 })
    expect(resumed.report.status).toBe('succeeded')
    expect(resumed.report.options.attempt).toBe(2)
    expect(resumed.report.options.input).toBe(snapshotDirectory)
    expect(await Bun.file(path.join(directory, 'run.log.jsonl')).text()).toContain(
      'artifact program succeeded',
    )

    const { bundles, verification } = await Effect.runPromise(
      Effect.gen(function* readAndVerify() {
        const entries = yield* bundleArchive.pipe(Stream.runCollect)
        return {
          bundles: [...entries],
          verification: yield* verifyBundleArchive(),
        }
      }).pipe(
        Effect.provide(
          SqliteClient.layer({ disableWAL: true, filename: outputPath, readonly: true }),
        ),
        Effect.scoped,
      ),
    )
    expect(bundles.map((bundle) => bundle.crawlId)).toEqual(['10', '20'])
    expect(bundles.map((bundle) => new TextDecoder().decode(bundle.bytes))).toEqual([
      sources[1]?.text,
      sources[0]?.text,
    ])
    expect(verification.crawls).toBe(2)

    const incompleteSelection = await Effect.runPromiseExit(
      importSnapshotBundles({
        compressionLevel: 1,
        limit: 1,
        outputPath,
        resume: true,
        snapshotDirectory,
      }),
    )
    expect(incompleteSelection._tag).toBe('Failure')

    const duplicate = await Effect.runPromise(
      Effect.gen(function* appendDuplicate() {
        const encoded = yield* encodeGzipBundle({
          compressionLevel: 1,
          crawlId: '10',
          source: Bun.gzipSync(sources[1].text, { level: 9 }),
          sourceKind: 'convex',
          sourceMetadataJson: '{}',
          sourceRef: 'live/10',
        })
        return yield* appendBundle(encoded)
      }).pipe(Effect.provide(SqliteClient.layer({ filename: outputPath })), Effect.scoped),
    )
    expect(duplicate).toBe('existing')

    const divergence = await Effect.runPromiseExit(
      Effect.gen(function* appendDivergence() {
        const encoded = yield* encodeGzipBundle({
          compressionLevel: 1,
          crawlId: '10',
          source: Bun.gzipSync('{"crawl_id":"10","different":true}'),
          sourceKind: 'convex',
          sourceMetadataJson: '{}',
          sourceRef: 'live/10',
        })
        return yield* appendBundle(encoded)
      }).pipe(Effect.provide(SqliteClient.layer({ filename: outputPath })), Effect.scoped),
    )
    expect(divergence._tag).toBe('Failure')

    const database = new Database(outputPath)
    expect(() =>
      database.run("UPDATE bundles SET source_ref = 'changed' WHERE crawl_id = '10'"),
    ).toThrow('bundle archive rows are immutable')
    const queryPlan = database
      .query<
        {
          detail: string
        },
        [string]
      >(
        `EXPLAIN QUERY PLAN SELECT * FROM bundles
          WHERE CAST(crawl_id AS INTEGER) > CAST(? AS INTEGER)
          ORDER BY CAST(crawl_id AS INTEGER) LIMIT 1`,
      )
      .all('10')
    expect(queryPlan.some((step) => step.detail.includes('bundles_crawl_id_integer'))).toBeTrue()
    database.close()
  })
})
