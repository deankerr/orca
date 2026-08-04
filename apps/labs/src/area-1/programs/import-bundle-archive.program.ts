import { SqliteClient } from '@effect/sql-sqlite-bun'
import * as Effect from 'effect/Effect'
import * as Command from 'effect/unstable/cli/Command'
import * as Flag from 'effect/unstable/cli/Flag'

import type { ArtifactRun, RunReport } from '../artifacts/types.ts'
import { findResumableArtifactRun, resolveArtifactReference } from '../artifacts/workspace.ts'
import { isCompressionLevel } from '../bundle-archive/encoding.ts'
import { importSnapshotBundles } from '../bundle-archive/import-snapshot.ts'
import { verifyBundleArchive } from '../bundle-archive/storage.ts'
import { runArtifactProgram, timedPhase } from '../observability/run.ts'
import { archiveMetrics, snapshotMetrics } from '../reports/metrics.ts'
import { logInputSummary, renderRunReport } from '../reports/render.ts'
import {
  configuredWorkDirectory,
  inputFlag,
  labelFlag,
  optionalValue,
  outputFlag,
} from './shared.ts'

const compressionLevelFlag = Flag.integer('compression-level').pipe(
  Flag.withDescription('Per-bundle Zstandard level; defaults to 1 or the resumed run policy'),
  Flag.optional,
)
const limitFlag = Flag.integer('limit').pipe(
  Flag.withDescription('Import only the first N snapshot bundles'),
  Flag.optional,
)
const resumeFlag = Flag.boolean('resume').pipe(
  Flag.withDescription('Continue the newest incomplete import, or the run selected by --output'),
)

interface ImportOptions {
  readonly compressionLevel?: number
  readonly input?: string
  readonly label?: string
  readonly limit?: number
  readonly outputDirectory?: string
  readonly resume: boolean
  readonly workDirectory: string
}

interface ResumableImport {
  readonly report: RunReport
  readonly run: ArtifactRun
}

const resolveCompressionLevel = (options: ImportOptions, resumed: ResumableImport | undefined) => {
  const previousCompressionLevel = resumed?.report.options.compressionLevel
  const storedCompressionLevel =
    typeof previousCompressionLevel === 'number' ? previousCompressionLevel : undefined
  if (
    storedCompressionLevel !== undefined &&
    options.compressionLevel !== undefined &&
    options.compressionLevel !== storedCompressionLevel
  ) {
    throw new Error('--compression-level must match the original import when resuming')
  }
  const compressionLevel = options.compressionLevel ?? storedCompressionLevel ?? 1
  if (!isCompressionLevel(compressionLevel)) {
    throw new Error('--compression-level must be between 0 and 9')
  }
  return compressionLevel
}

const resolveLimit = (options: ImportOptions, resumed: ResumableImport | undefined) => {
  const previousLimit = resumed?.report.options.limit
  const storedLimit = typeof previousLimit === 'number' ? previousLimit : undefined
  if (resumed !== undefined && options.limit !== undefined && options.limit !== storedLimit) {
    throw new Error('--limit must match the original import when resuming')
  }
  const limit = resumed === undefined ? options.limit : storedLimit
  if (limit !== undefined && limit < 1) {
    throw new Error('--limit must be positive')
  }
  return limit
}

const resolveInput = (options: ImportOptions, resumed: ResumableImport | undefined) => {
  const previousInput = resumed?.report.options.input
  const storedInput = typeof previousInput === 'string' ? previousInput : undefined
  if (storedInput !== undefined && options.input !== undefined) {
    throw new Error('--input is restored from the original import; omit it when resuming')
  }
  return storedInput ?? options.input
}

const resolveAttempt = (resumed: ResumableImport | undefined) => {
  const previousAttempt = resumed?.report.options.attempt
  if (resumed === undefined) {
    return 1
  }
  return typeof previousAttempt === 'number' ? previousAttempt + 1 : 2
}

const resolveImportPolicy = (options: ImportOptions, resumed: ResumableImport | undefined) => {
  if (resumed !== undefined && options.label !== undefined) {
    throw new Error('--label cannot be changed when resuming an import')
  }

  return {
    attempt: resolveAttempt(resumed),
    compressionLevel: resolveCompressionLevel(options, resumed),
    input: resolveInput(options, resumed),
    limit: resolveLimit(options, resumed),
  }
}

/** Imports exact raw bundle bytes from a snapshot into a verified append-only SQLite archive. */
export const importBundleArchive = Effect.fn('labs.importBundleArchive')(
  function* importBundleArchive(options: ImportOptions) {
    const resumed = options.resume
      ? yield* findResumableArtifactRun({
          kind: 'archive',
          outputDirectory: options.outputDirectory,
          program: 'archive.import',
          workDirectory: options.workDirectory,
        })
      : undefined
    const policy = yield* Effect.try({
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
      try: () => resolveImportPolicy(options, resumed),
    })

    // Resolve input
    const input = yield* resolveArtifactReference({
      kind: 'snapshot',
      reference: policy.input,
      supportedVersions: [1],
      workDirectory: options.workDirectory,
    })
    const inputMetrics = yield* snapshotMetrics(input.path)

    // Import and verify
    return yield* runArtifactProgram({
      execute: (run) =>
        Effect.gen(function* importAndVerify() {
          yield* logInputSummary(input, inputMetrics)
          const imported = yield* timedPhase(
            'import raw bundle archive',
            importSnapshotBundles({
              compressionLevel: policy.compressionLevel,
              limit: policy.limit,
              outputPath: run.artifactPath,
              resume: resumed !== undefined,
              snapshotDirectory: input.path,
            }),
          )
          const verification = yield* timedPhase(
            'verify raw bundle archive',
            verifyBundleArchive().pipe(
              Effect.provide(
                SqliteClient.layer({
                  disableWAL: true,
                  filename: run.artifactPath,
                  readonly: true,
                }),
              ),
              Effect.scoped,
            ),
          )
          const metrics = yield* archiveMetrics(run.artifactPath).pipe(
            Effect.provide(
              SqliteClient.layer({
                disableWAL: true,
                filename: run.artifactPath,
                readonly: true,
              }),
            ),
            Effect.scoped,
          )
          return {
            artifact: { format: 'orca-bundle-archive', formatVersion: 1 },
            inputs: [input],
            metrics: {
              ...metrics,
              existingCrawls: imported.value.existing,
              importDurationMs: Math.round(imported.durationMs),
              insertedCrawls: imported.value.inserted,
              verifiedCrawls: verification.value.crawls,
              verifyDurationMs: Math.round(verification.durationMs),
            },
            value: { imported: imported.value, metrics, verification: verification.value },
          }
        }),
      initialInputs: [input],
      kind: 'archive',
      label: options.label,
      outputDirectory: options.outputDirectory,
      program: 'archive.import',
      reportOptions: {
        attempt: policy.attempt,
        compressionLevel: policy.compressionLevel,
        input: input.path,
        limit: policy.limit ?? null,
        processId: process.pid,
      },
      resume: resumed,
      workDirectory: options.workDirectory,
    })
  },
)

export const importBundleArchiveCommand = Command.make('import', {
  compressionLevel: compressionLevelFlag,
  input: inputFlag,
  label: labelFlag,
  limit: limitFlag,
  output: outputFlag,
  resume: resumeFlag,
}).pipe(
  Command.withDescription('Losslessly repack snapshot bundles into an append-only raw archive'),
  Command.withHandler((input) =>
    Effect.gen(function* runImportBundleArchiveCommand() {
      const workDirectory = yield* configuredWorkDirectory
      const result = yield* importBundleArchive({
        compressionLevel: optionalValue(input.compressionLevel),
        input: optionalValue(input.input),
        label: optionalValue(input.label),
        limit: optionalValue(input.limit),
        outputDirectory: optionalValue(input.output),
        resume: input.resume,
        workDirectory,
      })
      yield* renderRunReport(result.report)
    }),
  ),
)
