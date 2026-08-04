import { mkdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'

import { SqliteClient } from '@effect/sql-sqlite-bun'
import * as Clock from 'effect/Clock'
import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'
import * as SqlClient from 'effect/unstable/sql/SqlClient'

import { corpusCrawls, readCorpusManifest } from '../corpus/storage.ts'
import { materialize } from '../projection/materialize.ts'
import { planCrawl } from '../projection/plan.ts'
import type { ProjectionState } from '../projection/types.ts'
import { selectHistoricalCrawls } from './precision.ts'
import type { HistoricalPrecision } from './precision.ts'
import { initializeDatabase } from './schema.ts'
import { commitCrawl } from './write.ts'

interface DatabaseOptions {
  readonly corpusDirectory: string
  readonly limit?: number
  readonly outputPath: string
  readonly precision?: HistoricalPrecision
}

const populate = Effect.fn('labs.populateProductDatabase')(function* populate(
  corpusDirectory: string,
  total: number,
  precision: HistoricalPrecision,
) {
  // Initialize projection
  const sql = yield* SqlClient.SqlClient
  const clock = yield* Clock.Clock
  yield* initializeDatabase()
  yield* sql`INSERT INTO database_metadata ${sql.insert([
    { key: 'historical_precision', value: precision },
    { key: 'processor_version', value: 'core-v2' },
  ])}`
  let state: ProjectionState = { endpoints: new Map(), models: new Map() }
  let previousCrawlId: string | undefined
  let eventCount = 0
  const startedAt = clock.currentTimeMillisUnsafe()
  let commitDurationMs = 0
  let materializeDurationMs = 0
  let planDurationMs = 0

  // Replay selected crawls
  let completed = 0
  yield* selectHistoricalCrawls(
    corpusCrawls(corpusDirectory).pipe(Stream.take(total)),
    precision,
  ).pipe(
    Stream.runForEach((crawl) =>
      Effect.gen(function* processCrawl() {
        const materializeStarted = clock.currentTimeNanosUnsafe()
        const batch = materialize(crawl)
        const planStarted = clock.currentTimeNanosUnsafe()
        const plan = planCrawl(state, batch, previousCrawlId)
        const commitStarted = clock.currentTimeNanosUnsafe()
        yield* commitCrawl(plan)
        const committedAt = clock.currentTimeNanosUnsafe()

        materializeDurationMs += Number(planStarted - materializeStarted) / 1_000_000
        planDurationMs += Number(commitStarted - planStarted) / 1_000_000
        commitDurationMs += Number(committedAt - commitStarted) / 1_000_000

        state = plan.after
        previousCrawlId = crawl.crawlId
        eventCount += plan.events.length
        completed += 1
        if (completed % (precision === 'daily' ? 30 : 250) === 0) {
          yield* Effect.logInfo('database progress').pipe(
            Effect.annotateLogs({
              commitDurationMs: Math.round(commitDurationMs),
              completed,
              elapsedSeconds: Math.round((clock.currentTimeMillisUnsafe() - startedAt) / 1000),
              events: eventCount,
              materializeDurationMs: Math.round(materializeDurationMs),
              planDurationMs: Math.round(planDurationMs),
              precision,
              sourceCrawls: total,
            }),
          )
        }
      }),
    ),
  )

  // Finalize database
  yield* sql`PRAGMA optimize`
  return {
    crawls: completed,
    endpoints: state.endpoints.size,
    events: eventCount,
    models: state.models.size,
    timings: {
      commitDurationMs: Math.round(commitDurationMs),
      materializeDurationMs: Math.round(materializeDurationMs),
      planDurationMs: Math.round(planDurationMs),
    },
  }
})

/** Replays a corpus into a new SQLite product database at an exact output path. */
export const replayProductDatabase = Effect.fn('labs.replayProductDatabase')(
  function* replayProductDatabase(options: DatabaseOptions) {
    const manifest = yield* readCorpusManifest(options.corpusDirectory)
    const precision = options.precision ?? 'daily'
    const total =
      options.limit === undefined
        ? manifest.counts.accepted
        : Math.min(options.limit, manifest.counts.accepted)
    if (total === 0) {
      return yield* Effect.fail(new Error('corpus contains no accepted crawls'))
    }

    const outputPath = path.resolve(options.outputPath)
    const temporaryPath = `${outputPath}.${crypto.randomUUID()}.tmp`
    yield* Effect.tryPromise(async () => await mkdir(path.dirname(outputPath), { recursive: true }))
    yield* Effect.logInfo('building product database').pipe(
      Effect.annotateLogs({
        corpus: options.corpusDirectory,
        output: outputPath,
        precision,
        sourceCrawls: total,
      }),
    )

    const result = yield* populate(options.corpusDirectory, total, precision).pipe(
      Effect.provide(SqliteClient.layer({ disableWAL: true, filename: temporaryPath })),
      Effect.flatMap((summary) =>
        Effect.tryPromise(async () => {
          await rename(temporaryPath, outputPath)
          return summary
        }),
      ),
      Effect.ensuring(
        Effect.promise(async () => {
          await rm(temporaryPath, { force: true })
        }),
      ),
    )
    yield* Effect.logInfo('product database ready').pipe(
      Effect.annotateLogs({ ...result, output: outputPath }),
    )
    return { ...result, outputPath, sourceCrawls: total }
  },
)
