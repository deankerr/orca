import { mkdir, stat } from 'node:fs/promises'

import * as Effect from 'effect/Effect'
import * as Command from 'effect/unstable/cli/Command'

import type { ArtifactReference } from '../artifacts/types.ts'
import { latestSnapshotZip } from '../artifacts/workspace.ts'
import { validateExtractedSnapshot } from '../bundle-archive/import-snapshot.ts'
import { runArtifactProgram, timedPhase } from '../observability/run.ts'
import { snapshotMetrics } from '../reports/metrics.ts'
import { logInputSummary, renderRunReport } from '../reports/render.ts'
import {
  configuredWorkDirectory,
  inputFlag,
  labelFlag,
  optionalValue,
  outputFlag,
} from './shared.ts'

const extractSnapshotFiles = Effect.fn('labs.extractSnapshotFiles')(
  function* extractSnapshotFiles(options: {
    readonly outputDirectory: string
    readonly snapshotPath: string
  }) {
    yield* Effect.tryPromise(async () => await mkdir(options.outputDirectory, { recursive: true }))
    yield* Effect.logInfo('extracting snapshot').pipe(
      Effect.annotateLogs({ output: options.outputDirectory, snapshot: options.snapshotPath }),
    )
    const process = Bun.spawn(
      [
        'unzip',
        '-q',
        '-n',
        options.snapshotPath,
        'snapshot_crawl_archives/documents.jsonl',
        '_storage/*',
        '-d',
        options.outputDirectory,
      ],
      { stderr: 'inherit', stdout: 'inherit' },
    )
    const exitCode = yield* Effect.promise(async () => await process.exited)
    if (exitCode !== 0 && exitCode !== 2) {
      return yield* Effect.fail(new Error(`unzip exited with status ${exitCode}`))
    }
    const validation = yield* validateExtractedSnapshot(options.outputDirectory)
    if (exitCode === 2) {
      yield* Effect.logWarning('unzip reported a format error, but extraction is complete').pipe(
        Effect.annotateLogs({ exitCode }),
      )
    }
    yield* Effect.logInfo('snapshot ready').pipe(
      Effect.annotateLogs({ blobs: validation.storageEntries, output: options.outputDirectory }),
    )
    return validation
  },
)

/** Extracts the reusable crawl subset from the newest production snapshot ZIP by default. */
export const extractSnapshot = Effect.fn('labs.extractSnapshot')(
  function* extractSnapshot(options: {
    readonly input?: string
    readonly label?: string
    readonly outputDirectory?: string
    readonly workDirectory: string
  }) {
    // Resolve input
    const snapshotPath = options.input ?? (yield* latestSnapshotZip())
    const snapshotStat = yield* Effect.tryPromise(async () => await stat(snapshotPath))
    const input: ArtifactReference = {
      format: 'convex-snapshot-zip',
      formatVersion: 1,
      kind: 'snapshot',
      path: snapshotPath,
    }
    // Extract and report
    return yield* runArtifactProgram({
      execute: (run) =>
        Effect.gen(function* extractAndMeasure() {
          yield* logInputSummary(input, { bytes: snapshotStat.size })
          const extraction = yield* timedPhase(
            'extract snapshot',
            extractSnapshotFiles({
              outputDirectory: run.artifactPath,
              snapshotPath,
            }),
          )
          const metrics = yield* snapshotMetrics(run.artifactPath)
          return {
            artifact: { format: 'orca-extracted-snapshot', formatVersion: 1 },
            inputs: [input],
            metrics: {
              ...metrics,
              extractionDurationMs: Math.round(extraction.durationMs),
            },
            value: { metrics, outputDirectory: run.artifactPath },
          }
        }),
      kind: 'snapshot',
      label: options.label,
      outputDirectory: options.outputDirectory,
      program: 'snapshot.extract',
      reportOptions: { snapshotPath },
      workDirectory: options.workDirectory,
    })
  },
)

export const extractSnapshotCommand = Command.make('extract', {
  input: inputFlag,
  label: labelFlag,
  output: outputFlag,
}).pipe(
  Command.withDescription('Extract reusable crawl inputs from the latest Convex snapshot'),
  Command.withHandler((input) =>
    Effect.gen(function* runExtractSnapshotCommand() {
      const workDirectory = yield* configuredWorkDirectory
      const result = yield* extractSnapshot({
        input: optionalValue(input.input),
        label: optionalValue(input.label),
        outputDirectory: optionalValue(input.output),
        workDirectory,
      })
      yield* renderRunReport(result.report)
    }),
  ),
)
