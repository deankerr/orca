import * as Cause from 'effect/Cause'
import * as Clock from 'effect/Clock'
import * as Effect from 'effect/Effect'
import * as Logger from 'effect/Logger'

import type {
  ArtifactKind,
  ArtifactProgramResult,
  ArtifactReference,
  ArtifactRun,
  RunReport,
} from '../artifacts/types.ts'
import { createArtifactRun } from '../artifacts/workspace.ts'

const writeReport = (run: ArtifactRun, report: RunReport) =>
  Effect.tryPromise(
    async () => await Bun.write(run.reportPath, `${JSON.stringify(report, null, 2)}\n`),
  )

const initialReport = (
  run: ArtifactRun,
  inputs: readonly ArtifactReference[],
  program: string,
  options: Readonly<Record<string, unknown>>,
): RunReport => ({
  format: 'orca-labs-run-report',
  formatVersion: 1,
  inputs,
  metrics: {},
  options,
  program,
  runId: run.runId,
  startedAt: run.startedAt,
  status: 'running',
})

/** Times one named phase with Effect's monotonic clock and emits a structured completion log. */
export const timedPhase = <A, E, R>(name: string, effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* timedPhaseEffect() {
    const clock = yield* Clock.Clock
    const started = clock.currentTimeNanosUnsafe()
    yield* Effect.logInfo('phase started').pipe(Effect.annotateLogs({ phase: name }))
    const value = yield* effect
    const completed = clock.currentTimeNanosUnsafe()
    const durationMs = Number(completed - started) / 1_000_000
    yield* Effect.logInfo('phase completed').pipe(
      Effect.annotateLogs({ durationMs: Math.round(durationMs), phase: name }),
    )
    return { durationMs, value }
  })

/**
 * Runs an artifact-producing workflow with a durable JSONL logger and lifecycle report. The
 * callback must publish its artifact before returning; success is recorded only afterwards.
 */
export const runArtifactProgram = <A, E, R>(options: {
  readonly execute: (run: ArtifactRun) => Effect.Effect<ArtifactProgramResult<A>, E, R>
  readonly initialInputs?: readonly ArtifactReference[]
  readonly kind: ArtifactKind
  readonly label?: string
  readonly outputDirectory?: string
  readonly program: string
  readonly reportOptions: Readonly<Record<string, unknown>>
  readonly resume?: { readonly report: RunReport; readonly run: ArtifactRun }
  readonly workDirectory: string
}) =>
  Effect.scoped(
    Effect.gen(function* runObservedArtifactProgram() {
      const run = options.resume?.run ?? (yield* createArtifactRun(options))
      const report = initialReport(
        run,
        options.initialInputs ?? options.resume?.report.inputs ?? [],
        options.program,
        options.reportOptions,
      )
      yield* writeReport(run, report)

      const fileLogger = yield* Logger.toFile(Logger.formatJson, run.logPath, { batchWindow: 100 })
      const execute = options.execute(run).pipe(
        Effect.annotateLogs({
          artifactKind: options.kind,
          program: options.program,
          runId: run.runId,
        }),
      )

      return yield* execute.pipe(
        Effect.matchCauseEffect({
          onFailure: (cause) =>
            Effect.gen(function* recordFailure() {
              const completedAtMillis = yield* Clock.currentTimeMillis
              yield* writeReport(run, {
                ...report,
                completedAt: new Date(completedAtMillis).toISOString(),
                durationMs: completedAtMillis - run.startedAtMillis,
                failure: Cause.pretty(cause),
                status: 'failed',
              })
              yield* Effect.logError('artifact program failed').pipe(
                Effect.annotateLogs({
                  failure: Cause.pretty(cause),
                  runDirectory: run.runDirectory,
                }),
              )
              return yield* Effect.failCause(cause)
            }),
          onSuccess: (result) =>
            Effect.gen(function* recordSuccess() {
              const completedAtMillis = yield* Clock.currentTimeMillis
              const completedReport: RunReport = {
                ...report,
                artifact: {
                  ...result.artifact,
                  kind: options.kind,
                  path: pathRelative(run.runDirectory, run.artifactPath),
                },
                completedAt: new Date(completedAtMillis).toISOString(),
                durationMs: completedAtMillis - run.startedAtMillis,
                inputs: result.inputs,
                metrics: result.metrics,
                status: 'succeeded',
              }
              yield* writeReport(run, completedReport)
              yield* Effect.logInfo('artifact program succeeded').pipe(
                Effect.annotateLogs({
                  durationMs: completedReport.durationMs,
                  output: run.artifactPath,
                  runDirectory: run.runDirectory,
                }),
              )
              return { ...result.value, report: completedReport, run }
            }),
        }),
        Effect.provide(Logger.layer([fileLogger], { mergeWithExisting: true })),
      )
    }),
  )

const pathRelative = (from: string, to: string) => {
  const relative = to.startsWith(`${from}/`) ? to.slice(from.length + 1) : to
  return relative === '' ? '.' : relative
}
