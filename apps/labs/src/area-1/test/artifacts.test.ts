import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import * as BunServices from '@effect/platform-bun/BunServices'
import * as Effect from 'effect/Effect'
import * as TestClock from 'effect/testing/TestClock'

import { isRunReport } from '../artifacts/types.ts'
import { createArtifactRun, latestCompatibleArtifact } from '../artifacts/workspace.ts'
import { runArtifactProgram } from '../observability/run.ts'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true })
    }),
  )
})

const workspace = async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'orca-labs-artifacts-'))
  directories.push(directory)
  return directory
}

describe('Labs artifact workspace', () => {
  test('allocates chronological run ids and suffixes same-second collisions', async () => {
    const workDirectory = await workspace()
    const [first, second] = await Effect.runPromise(
      Effect.gen(function* allocateRuns() {
        yield* TestClock.setTime(Date.parse('2026-08-04T08:14:23.000Z'))
        const firstRun = yield* createArtifactRun({ kind: 'archive', workDirectory })
        const secondRun = yield* createArtifactRun({ kind: 'archive', workDirectory })
        return [firstRun, secondRun] as const
      }).pipe(Effect.provide(TestClock.layer())),
    )

    expect(first.runId).toBe('2026-08-04T08-14-23Z')
    expect(second.runId).toBe('2026-08-04T08-14-23Z-01')
    expect(first.artifactPath).toEndWith('/bundles.sqlite')
  })

  test('resolves only successful compatible published artifacts as latest', async () => {
    const workDirectory = await workspace()
    const result = await Effect.runPromise(
      runArtifactProgram({
        execute: (run) =>
          Effect.gen(function* publishArchive() {
            yield* Effect.promise(async () => await Bun.write(run.artifactPath, 'archive'))
            return {
              artifact: { format: 'orca-raw-bundle-archive', formatVersion: 1 },
              inputs: [],
              metrics: { rows: 1 },
              value: { rows: 1 },
            }
          }),
        kind: 'archive',
        program: 'archive.test',
        reportOptions: {},
        workDirectory,
      }).pipe(Effect.provide(BunServices.layer)),
    )
    await Effect.runPromise(
      runArtifactProgram({
        execute: (run) =>
          Effect.gen(function* publishIncompatibleArchive() {
            yield* Effect.promise(async () => await Bun.write(run.artifactPath, 'archive'))
            return {
              artifact: { format: 'future-raw-bundle-archive', formatVersion: 2 },
              inputs: [],
              metrics: {},
              value: {},
            }
          }),
        kind: 'archive',
        program: 'archive.future-test',
        reportOptions: {},
        workDirectory,
      }).pipe(Effect.provide(BunServices.layer)),
    )
    await Effect.runPromiseExit(
      runArtifactProgram({
        execute: () => Effect.fail(new Error('newer failed run')),
        kind: 'archive',
        program: 'archive.failed-test',
        reportOptions: {},
        workDirectory,
      }).pipe(Effect.provide(BunServices.layer)),
    )
    const latest = await Effect.runPromise(
      latestCompatibleArtifact({ kind: 'archive', supportedVersions: [1], workDirectory }),
    )

    expect(latest.path).toBe(result.run.artifactPath)
    expect(latest.runId).toBe(result.run.runId)
    expect(await Bun.file(result.run.logPath).text()).toContain('artifact program succeeded')
  })

  test('retains a failed report and log without publishing an artifact', async () => {
    const workDirectory = await workspace()
    const exit = await Effect.runPromiseExit(
      runArtifactProgram({
        execute: () => Effect.fail(new Error('expected failure')),
        kind: 'archive',
        program: 'archive.test',
        reportOptions: {},
        workDirectory,
      }).pipe(Effect.provide(BunServices.layer)),
    )
    expect(exit._tag).toBe('Failure')

    const [runDirectory] = await Array.fromAsync(
      new Bun.Glob('archives/*').scan({ cwd: workDirectory, onlyFiles: false }),
    )
    const report: unknown = await Bun.file(
      path.join(workDirectory, runDirectory ?? '', 'report.json'),
    ).json()
    expect(isRunReport(report)).toBeTrue()
    if (!isRunReport(report)) {
      throw new Error('expected a valid failed run report')
    }
    expect(report.status).toBe('failed')
    expect(report.failure).toContain('expected failure')
    expect(
      await Bun.file(path.join(workDirectory, runDirectory ?? '', 'run.log.jsonl')).text(),
    ).toContain('artifact program failed')
    expect(
      await Bun.file(path.join(workDirectory, runDirectory ?? '', 'bundles.sqlite')).exists(),
    ).toBeFalse()
  })
})
