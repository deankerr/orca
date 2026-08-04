import * as Effect from 'effect/Effect'
import * as Command from 'effect/unstable/cli/Command'

import { inspectionReport, readArtifactReport } from '../artifacts/report.ts'
import type { ArtifactKind, RunReport } from '../artifacts/types.ts'
import { resolveArtifactReference } from '../artifacts/workspace.ts'
import { corpusMetrics, databaseMetrics, snapshotMetrics } from '../reports/metrics.ts'
import { renderRunReport } from '../reports/render.ts'
import {
  configuredWorkDirectory,
  inputFlag,
  jsonFlag,
  optionalValue,
  printJson,
  provideReadOnlyDatabase,
} from './shared.ts'

const inspectArtifact = Effect.fn('labs.inspectArtifact')(function* inspectArtifact(options: {
  readonly input?: string
  readonly kind: ArtifactKind
  readonly workDirectory: string
}) {
  const supportedVersions = options.kind === 'corpus' || options.kind === 'database' ? [2] : [1]
  const artifact = yield* resolveArtifactReference({
    kind: options.kind,
    reference: options.input,
    supportedVersions,
    workDirectory: options.workDirectory,
  })
  const stored = yield* readArtifactReport(artifact)
  if (stored !== null) {
    return stored
  }

  let metrics: Readonly<Record<string, unknown>>
  if (options.kind === 'snapshot') {
    metrics = yield* snapshotMetrics(artifact.path)
  } else if (options.kind === 'corpus') {
    metrics = yield* corpusMetrics(artifact.path)
  } else {
    metrics = yield* databaseMetrics(artifact.path).pipe(provideReadOnlyDatabase(artifact.path))
  }

  return inspectionReport({ artifact, metrics, program: `${options.kind}.report` })
})

const reportCommand = (kind: ArtifactKind) =>
  Command.make('report', { input: inputFlag, json: jsonFlag }).pipe(
    Command.withDescription(`Report the characteristics of a ${kind} artifact`),
    Command.withHandler((input) =>
      Effect.gen(function* runReportCommand() {
        const workDirectory = yield* configuredWorkDirectory
        const report: RunReport = yield* inspectArtifact({
          input: optionalValue(input.input),
          kind,
          workDirectory,
        })
        yield* input.json ? printJson(report) : renderRunReport(report)
      }),
    ),
  )

export const reportSnapshotCommand = reportCommand('snapshot')
export const reportCorpusCommand = reportCommand('corpus')
export const reportDatabaseCommand = reportCommand('database')
