import * as Console from 'effect/Console'
import * as Effect from 'effect/Effect'

import type { ArtifactReference, RunReport } from '../artifacts/types.ts'

const number = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 2 })

const formatValue = (value: unknown): string => {
  if (typeof value === 'number') {
    return number.format(value)
  }
  if (value === null) {
    return 'none'
  }
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    return JSON.stringify(value)
  }
  if (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    value === undefined
  ) {
    return String(value)
  }
  return 'unknown'
}

/** Prints a stable, compact report suitable for learning about an artifact without manual SQL. */
export const renderRunReport = (report: RunReport) =>
  Effect.gen(function* renderReport() {
    yield* Console.log(`${report.program} · ${report.status}`)
    yield* Console.log(`run: ${report.runId}`)
    if (report.artifact !== undefined) {
      yield* Console.log(
        `artifact: ${report.artifact.kind} ${report.artifact.format}@${report.artifact.formatVersion}`,
      )
    }
    for (const [key, value] of Object.entries(report.metrics)) {
      yield* Console.log(`${key}: ${formatValue(value)}`)
    }
    if (report.durationMs !== undefined) {
      yield* Console.log(`durationMs: ${number.format(report.durationMs)}`)
    }
    if (report.failure !== undefined) {
      yield* Console.error(report.failure)
    }
  })

/** Logs the concise identity and characteristics of an input before expensive processing starts. */
export const logInputSummary = (
  input: ArtifactReference,
  metrics: Readonly<Record<string, unknown>>,
) =>
  Effect.logInfo('input ready').pipe(
    Effect.annotateLogs({
      format: input.format,
      formatVersion: input.formatVersion,
      input: input.path,
      inputKind: input.kind,
      ...metrics,
    }),
  )
