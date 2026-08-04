import { SqliteClient } from '@effect/sql-sqlite-bun'
import * as Effect from 'effect/Effect'
import * as Command from 'effect/unstable/cli/Command'
import * as Flag from 'effect/unstable/cli/Flag'

import { resolveArtifactReference } from '../artifacts/workspace.ts'
import { replayProductDatabase } from '../database/build.ts'
import type { HistoricalPrecision } from '../database/precision.ts'
import { runArtifactProgram, timedPhase } from '../observability/run.ts'
import { archiveMetrics, databaseMetrics } from '../reports/metrics.ts'
import { logInputSummary, renderRunReport } from '../reports/render.ts'
import {
  configuredWorkDirectory,
  inputFlag,
  labelFlag,
  optionalValue,
  outputFlag,
} from './shared.ts'

const limitFlag = Flag.integer('limit').pipe(
  Flag.withDescription('Process only the first N accepted source crawls'),
  Flag.optional,
)
const precisionFlag = Flag.choice('precision', ['daily', 'full']).pipe(
  Flag.withDescription('Historical projection precision'),
  Flag.withDefault('daily'),
)

/** Replays an explicit raw archive, or the latest compatible archive, into a product database. */
export const buildDatabase = Effect.fn('labs.buildDatabase')(function* buildDatabase(options: {
  readonly input?: string
  readonly label?: string
  readonly limit?: number
  readonly outputDirectory?: string
  readonly precision: HistoricalPrecision
  readonly workDirectory: string
}) {
  if (options.limit !== undefined && options.limit < 1) {
    return yield* Effect.fail(new Error('--limit must be positive'))
  }

  // Resolve input
  const input = yield* resolveArtifactReference({
    kind: 'archive',
    reference: options.input,
    supportedVersions: [1],
    workDirectory: options.workDirectory,
  })
  const inputMetrics = yield* archiveMetrics(input.path).pipe(
    Effect.provide(SqliteClient.layer({ disableWAL: true, filename: input.path, readonly: true })),
    Effect.scoped,
  )

  // Replay and report
  return yield* runArtifactProgram({
    execute: (run) =>
      Effect.gen(function* replayAndMeasure() {
        yield* logInputSummary(input, inputMetrics)
        const replay = yield* timedPhase(
          'replay product database',
          replayProductDatabase({
            archivePath: input.path,
            limit: options.limit,
            outputPath: run.artifactPath,
            precision: options.precision,
          }),
        )
        const summary = replay.value
        const metrics = yield* databaseMetrics(run.artifactPath).pipe(
          Effect.provide(
            SqliteClient.layer({
              disableWAL: true,
              filename: run.artifactPath,
              readonly: true,
            }),
          ),
        )
        return {
          artifact: { format: 'orca-product-database', formatVersion: 2 },
          inputs: [input],
          metrics: {
            ...metrics,
            crawlsPerSecond:
              replay.durationMs === 0 ? null : (summary.crawls * 1000) / replay.durationMs,
            replayDurationMs: Math.round(replay.durationMs),
            sourceBundles: summary.sourceBundles,
            sourceBundlesRead: summary.sourceBundlesRead,
            timings: summary.timings,
          },
          value: { ...summary, metrics },
        }
      }),
    kind: 'database',
    label: options.label,
    outputDirectory: options.outputDirectory,
    program: 'database.build',
    reportOptions: { limit: options.limit ?? null, precision: options.precision },
    workDirectory: options.workDirectory,
  })
})

export const buildDatabaseCommand = Command.make('build', {
  input: inputFlag,
  label: labelFlag,
  limit: limitFlag,
  output: outputFlag,
  precision: precisionFlag,
}).pipe(
  Command.withDescription('Replay the latest raw archive into a local product database'),
  Command.withHandler((input) =>
    Effect.gen(function* runBuildDatabaseCommand() {
      const workDirectory = yield* configuredWorkDirectory
      const result = yield* buildDatabase({
        input: optionalValue(input.input),
        label: optionalValue(input.label),
        limit: optionalValue(input.limit),
        outputDirectory: optionalValue(input.output),
        precision: input.precision,
        workDirectory,
      })
      yield* renderRunReport(result.report)
    }),
  ),
)
