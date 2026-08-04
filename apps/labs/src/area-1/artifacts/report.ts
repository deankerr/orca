import path from 'node:path'

import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import type { ArtifactReference, RunReport } from './types.ts'
import { isRunReport } from './types.ts'

const decodeUnknownJson = Schema.decodeUnknownSync(Schema.UnknownFromJsonString)

/** Reads the lifecycle report adjacent to an indexed artifact reference. */
export const readArtifactReport = Effect.fn('labs.readArtifactReport')(function* readArtifactReport(
  reference: ArtifactReference,
) {
  if (reference.runId === undefined) {
    return null
  }

  const reportPath = path.join(path.dirname(reference.path), 'report.json')
  const text = yield* Effect.tryPromise(async () => await Bun.file(reportPath).text())
  const value = yield* Effect.try({
    catch: (cause) => new Error(`invalid Labs run report: ${reportPath}`, { cause }),
    try: () => decodeUnknownJson(text),
  })
  return isRunReport(value)
    ? value
    : yield* Effect.fail(new Error(`invalid Labs run report: ${reportPath}`))
})

/** Creates an in-memory report for a legacy direct-path artifact without a sidecar report. */
export const inspectionReport = (options: {
  readonly artifact: ArtifactReference
  readonly metrics: Readonly<Record<string, unknown>>
  readonly program: string
}): RunReport => ({
  artifact: {
    format: options.artifact.format,
    formatVersion: options.artifact.formatVersion,
    kind: options.artifact.kind,
    path: options.artifact.path,
  },
  format: 'orca-labs-run-report',
  formatVersion: 1,
  inputs: [options.artifact],
  metrics: options.metrics,
  options: {},
  program: options.program,
  runId: options.artifact.runId ?? 'unindexed-artifact',
  startedAt: new Date().toISOString(),
  status: 'succeeded',
})
