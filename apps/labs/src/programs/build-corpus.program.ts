import * as Effect from 'effect/Effect'
import * as Command from 'effect/unstable/cli/Command'
import * as Flag from 'effect/unstable/cli/Flag'

import { resolveArtifactReference } from '../artifacts/workspace.ts'
import { isCompressionLevel, writeCorpus } from '../corpus/build.ts'
import type { CorpusWindow } from '../corpus/build.ts'
import { runArtifactProgram, timedPhase } from '../observability/run.ts'
import { corpusMetrics, snapshotMetrics } from '../reports/metrics.ts'
import { logInputSummary, renderRunReport } from '../reports/render.ts'
import {
  configuredWorkDirectory,
  inputFlag,
  labelFlag,
  optionalValue,
  outputFlag,
} from './shared.ts'

const jobsFlag = Flag.integer('jobs').pipe(
  Flag.withAlias('j'),
  Flag.withDescription(
    'Maximum overlapping snapshot blob reads; CPU transforms stay single-threaded',
  ),
  Flag.withDefault(4),
)
const compressionLevelFlag = Flag.integer('compression-level').pipe(
  Flag.withDescription('Zstandard compression level from 0 (fastest) to 9 (smallest)'),
  Flag.withDefault(1),
)
const shardSizeFlag = Flag.integer('shard-size').pipe(
  Flag.withDescription('Maximum source crawls per compressed shard'),
  Flag.withDefault(256),
)
const limitFlag = Flag.integer('limit').pipe(
  Flag.withDescription('Process only the first N snapshot crawls'),
  Flag.optional,
)
const windowsFlag = Flag.string('windows').pipe(
  Flag.withDescription('Comma-separated diagnostic crawl windows as offset:count pairs'),
  Flag.optional,
)

const parseWindows = (value: string | undefined): readonly CorpusWindow[] | undefined => {
  if (value === undefined) {
    return undefined
  }
  const windows = value.split(',').map((window) => {
    const match = /^(?<offset>\d+):(?<count>\d+)$/.exec(window.trim())
    if (match?.groups === undefined) {
      throw new Error('--windows must contain comma-separated offset:count pairs')
    }
    const offset = Number(match.groups.offset)
    const count = Number(match.groups.count)
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(count) || count < 1) {
      throw new Error('--windows offsets must be non-negative and counts must be positive')
    }
    return { count, offset }
  })
  for (const [index, window] of windows.entries()) {
    const previous = windows[index - 1]
    if (previous !== undefined && window.offset < previous.offset + previous.count) {
      throw new Error('--windows must be ordered and non-overlapping')
    }
  }
  return windows
}

/** Builds a clean corpus from an explicit snapshot or the latest successful compatible one. */
export const buildCorpus = Effect.fn('labs.buildCorpus')(function* buildCorpus(options: {
  readonly compressionLevel: number
  readonly input?: string
  readonly jobs: number
  readonly label?: string
  readonly limit?: number
  readonly outputDirectory?: string
  readonly shardSize: number
  readonly workDirectory: string
  readonly windows?: string
}) {
  const { compressionLevel } = options
  const windows = yield* Effect.try({
    catch: (cause) => (cause instanceof Error ? cause : new Error('could not parse --windows')),
    try: () => parseWindows(options.windows),
  })

  if (options.jobs < 1) {
    return yield* Effect.fail(new Error('--jobs must be positive'))
  }
  if (!isCompressionLevel(compressionLevel)) {
    return yield* Effect.fail(new Error('--compression-level must be between 0 and 9'))
  }
  if (options.shardSize < 1) {
    return yield* Effect.fail(new Error('--shard-size must be positive'))
  }
  if (options.limit !== undefined && options.limit < 1) {
    return yield* Effect.fail(new Error('--limit must be positive'))
  }
  if (options.limit !== undefined && windows !== undefined) {
    return yield* Effect.fail(new Error('--limit and --windows cannot be used together'))
  }

  // Resolve input
  const input = yield* resolveArtifactReference({
    kind: 'snapshot',
    reference: options.input,
    supportedVersions: [1],
    workDirectory: options.workDirectory,
  })
  const inputMetrics = yield* snapshotMetrics(input.path)
  const unavailableWindow = windows?.find(
    (window) => window.offset + window.count > inputMetrics.crawls,
  )
  if (unavailableWindow !== undefined) {
    return yield* Effect.fail(
      new Error(
        `--windows range ${unavailableWindow.offset}:${unavailableWindow.count} exceeds ${inputMetrics.crawls} available crawls`,
      ),
    )
  }

  // Build and report
  return yield* runArtifactProgram({
    execute: (run) =>
      Effect.gen(function* buildAndMeasure() {
        yield* logInputSummary(input, inputMetrics)
        const build = yield* timedPhase(
          'build corpus',
          writeCorpus({
            compressionLevel,
            jobs: options.jobs,
            limit: options.limit,
            outputDirectory: run.artifactPath,
            overwrite: false,
            shardSize: options.shardSize,
            snapshotDirectory: input.path,
            windows,
          }),
        )
        const summary = build.value
        const metrics = yield* corpusMetrics(run.artifactPath)
        return {
          artifact: { format: 'orca-corpus', formatVersion: 2 },
          inputs: [input],
          metrics: {
            ...metrics,
            buildDurationMs: Math.round(build.durationMs),
            crawlsPerSecond:
              build.durationMs === 0
                ? null
                : ((metrics.accepted + metrics.dropped) * 1000) / build.durationMs,
            peakRssBytes: summary.peakRssBytes,
            stageTotalsMs: summary.stageTotalsMs,
          },
          value: { ...summary, metrics },
        }
      }),
    kind: 'corpus',
    label: options.label,
    outputDirectory: options.outputDirectory,
    program: 'corpus.build',
    reportOptions: {
      compressionLevel: options.compressionLevel,
      jobs: options.jobs,
      limit: options.limit ?? null,
      shardSize: options.shardSize,
      windows: windows ?? null,
    },
    workDirectory: options.workDirectory,
  })
})

export const buildCorpusCommand = Command.make('build', {
  compressionLevel: compressionLevelFlag,
  input: inputFlag,
  jobs: jobsFlag,
  label: labelFlag,
  limit: limitFlag,
  output: outputFlag,
  shardSize: shardSizeFlag,
  windows: windowsFlag,
}).pipe(
  Command.withDescription('Clean and repack the latest snapshot into a reusable corpus'),
  Command.withHandler((input) =>
    Effect.gen(function* runBuildCorpusCommand() {
      const workDirectory = yield* configuredWorkDirectory
      const result = yield* buildCorpus({
        compressionLevel: input.compressionLevel,
        input: optionalValue(input.input),
        jobs: input.jobs,
        label: optionalValue(input.label),
        limit: optionalValue(input.limit),
        outputDirectory: optionalValue(input.output),
        shardSize: input.shardSize,
        windows: optionalValue(input.windows),
        workDirectory,
      })
      yield* renderRunReport(result.report)
    }),
  ),
)
