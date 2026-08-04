import { mkdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'

import { SqliteClient } from '@effect/sql-sqlite-bun'
import * as Clock from 'effect/Clock'
import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'
import * as SqlClient from 'effect/unstable/sql/SqlClient'

import { bundleArchive, bundleArchiveSummary } from '../bundle-archive/storage.ts'
import { inspectBundle, materializeCandidate } from '../projection/materialize.ts'
import type { MaterializationCandidate } from '../projection/materialize.ts'
import { planCrawl } from '../projection/plan.ts'
import type { ProjectionState } from '../projection/types.ts'
import { selectHistoricalCrawls } from './precision.ts'
import type { HistoricalPrecision } from './precision.ts'
import { initializeDatabase } from './schema.ts'
import { commitCrawl } from './write.ts'

interface DatabaseOptions {
  readonly archivePath: string
  readonly limit?: number
  readonly outputPath: string
  readonly precision?: HistoricalPrecision
}

const populate = Effect.fn('labs.populateProductDatabase')(function* populate(
  archivePath: string,
  sourceBundles: number,
  limit: number | undefined,
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
  let inspectDurationMs = 0
  let materializeDurationMs = 0
  let planDurationMs = 0
  let acceptedCrawls = 0
  let sourceBundlesRead = 0

  // Inspect raw bundles
  const inspected = bundleArchive.pipe(
    Stream.provide(SqliteClient.layer({ disableWAL: true, filename: archivePath, readonly: true })),
    Stream.mapEffect((bundle) =>
      Effect.gen(function* inspectRawBundle() {
        sourceBundlesRead += 1
        const started = clock.currentTimeNanosUnsafe()
        const result = yield* Effect.try({
          catch: (cause) =>
            new Error(`could not inspect archive crawl ${bundle.crawlId}`, { cause }),
          try: () => inspectBundle(bundle),
        })
        inspectDurationMs += Number(clock.currentTimeNanosUnsafe() - started) / 1_000_000
        if (result._tag === 'Accepted') {
          return result.candidate
        }
        yield* Effect.logWarning('raw bundle excluded from product projection').pipe(
          Effect.annotateLogs({ crawlId: result.crawlId, reason: result.reason }),
        )
        return null
      }),
    ),
    Stream.filter((candidate): candidate is MaterializationCandidate => candidate !== null),
  )
  const bounded = limit === undefined ? inspected : inspected.pipe(Stream.take(limit))
  const accepted = bounded.pipe(
    Stream.tap(() =>
      Effect.sync(() => {
        acceptedCrawls += 1
      }),
    ),
  )

  // Replay selected crawls
  let completed = 0
  yield* selectHistoricalCrawls(accepted, precision).pipe(
    Stream.runForEach((candidate) =>
      Effect.gen(function* processCrawl() {
        const materializeStarted = clock.currentTimeNanosUnsafe()
        const batch = yield* Effect.try({
          catch: (cause) =>
            new Error(`could not materialize archive crawl ${candidate.crawlId}`, { cause }),
          try: () => materializeCandidate(candidate),
        })
        const planStarted = clock.currentTimeNanosUnsafe()
        const plan = planCrawl(state, batch, previousCrawlId)
        const commitStarted = clock.currentTimeNanosUnsafe()
        yield* commitCrawl(plan)
        const committedAt = clock.currentTimeNanosUnsafe()

        materializeDurationMs += Number(planStarted - materializeStarted) / 1_000_000
        planDurationMs += Number(commitStarted - planStarted) / 1_000_000
        commitDurationMs += Number(committedAt - commitStarted) / 1_000_000

        state = plan.after
        previousCrawlId = candidate.crawlId
        eventCount += plan.events.length
        completed += 1
        if (completed % (precision === 'daily' ? 30 : 250) === 0) {
          yield* Effect.logInfo('database progress').pipe(
            Effect.annotateLogs({
              commitDurationMs: Math.round(commitDurationMs),
              completed,
              elapsedSeconds: Math.round((clock.currentTimeMillisUnsafe() - startedAt) / 1000),
              events: eventCount,
              inspectDurationMs: Math.round(inspectDurationMs),
              materializeDurationMs: Math.round(materializeDurationMs),
              planDurationMs: Math.round(planDurationMs),
              precision,
              sourceBundles,
            }),
          )
        }
      }),
    ),
  )

  // Finalize database
  yield* sql`PRAGMA optimize`
  return {
    acceptedCrawls,
    crawls: completed,
    endpoints: state.endpoints.size,
    events: eventCount,
    models: state.models.size,
    sourceBundles,
    sourceBundlesRead,
    timings: {
      commitDurationMs: Math.round(commitDurationMs),
      inspectDurationMs: Math.round(inspectDurationMs),
      materializeDurationMs: Math.round(materializeDurationMs),
      planDurationMs: Math.round(planDurationMs),
    },
  }
})

/** Replays a raw bundle archive into a new SQLite product database at an exact output path. */
export const replayProductDatabase = Effect.fn('labs.replayProductDatabase')(
  function* replayProductDatabase(options: DatabaseOptions) {
    const archivePath = path.resolve(options.archivePath)
    const archive = yield* bundleArchiveSummary().pipe(
      Effect.provide(
        SqliteClient.layer({ disableWAL: true, filename: archivePath, readonly: true }),
      ),
      Effect.scoped,
    )
    const precision = options.precision ?? 'daily'
    if (archive.crawls === 0) {
      return yield* Effect.fail(new Error('bundle archive contains no crawls'))
    }

    const outputPath = path.resolve(options.outputPath)
    const temporaryPath = `${outputPath}.${crypto.randomUUID()}.tmp`
    yield* Effect.tryPromise(async () => await mkdir(path.dirname(outputPath), { recursive: true }))
    yield* Effect.logInfo('building product database').pipe(
      Effect.annotateLogs({
        archive: archivePath,
        output: outputPath,
        precision,
        sourceBundles: archive.crawls,
      }),
    )

    const result = yield* populate(archivePath, archive.crawls, options.limit, precision).pipe(
      Effect.provide(SqliteClient.layer({ disableWAL: true, filename: temporaryPath })),
      Effect.flatMap((summary) => {
        if (summary.acceptedCrawls === 0) {
          return Effect.fail(new Error('bundle archive contains no materializable crawls'))
        }
        return Effect.tryPromise(async () => {
          await rename(temporaryPath, outputPath)
          return summary
        })
      }),
      Effect.ensuring(
        Effect.promise(async () => {
          await rm(temporaryPath, { force: true })
        }),
      ),
    )
    yield* Effect.logInfo('product database ready').pipe(
      Effect.annotateLogs({ ...result, output: outputPath }),
    )
    return { ...result, outputPath }
  },
)
