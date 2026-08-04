import { mkdir, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

import * as Clock from 'effect/Clock'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'

import type { ArtifactKind, ArtifactReference, ArtifactRun, RunReport } from './types.ts'
import { isRunReport } from './types.ts'

const repositoryRoot = path.resolve(import.meta.dir, '../../../..')
const artifactDirectories = {
  corpus: 'corpora',
  database: 'databases',
  snapshot: 'snapshots',
} satisfies Record<ArtifactKind, string>
const artifactNames = {
  corpus: 'corpus',
  database: 'products.sqlite',
  snapshot: 'snapshot',
} satisfies Record<ArtifactKind, string>

const pathExists = async (candidate: string) => {
  try {
    await stat(candidate)
    return true
  } catch {
    return false
  }
}

const timestampLabel = (millis: number) =>
  new Date(millis)
    .toISOString()
    .replaceAll(':', '-')
    .replace(/\.\d{3}Z$/, 'Z')

const safeLabel = (label: string | undefined): string | undefined => {
  if (label === undefined) {
    return undefined
  }

  const normalized = label
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9._-]+/g, '-')
  return normalized === '' ? undefined : normalized
}

const readReport = async (reportPath: string): Promise<RunReport | undefined> => {
  try {
    const value: unknown = await Bun.file(reportPath).json()
    if (isRunReport(value)) {
      return value
    }
  } catch {
    // An incomplete or foreign report is not a valid artifact index entry.
  }

  return undefined
}

/** Resolves the workspace once, keeping CLI and environment precedence out of individual programs. */
export const resolveWorkDirectory = (flagValue: Option.Option<string>) =>
  path.resolve(
    Option.getOrElse(
      flagValue,
      () => process.env.ORCA_LABS_WORK_DIR ?? path.join(repositoryRoot, '.labs-work'),
    ),
  )

/**
 * Allocates a timestamped run directory. The directory exists before processing begins so failed
 * jobs can retain their report and log, but its artifact path is not considered published yet.
 */
export const createArtifactRun = Effect.fn('labs.createArtifactRun')(
  function* createArtifactRun(options: {
    readonly kind: ArtifactKind
    readonly label?: string
    readonly outputDirectory?: string
    readonly workDirectory: string
  }) {
    const startedAtMillis = yield* Clock.currentTimeMillis
    const baseId = [timestampLabel(startedAtMillis), safeLabel(options.label)]
      .filter((part) => part !== undefined)
      .join('-')
    const typeDirectory = path.join(options.workDirectory, artifactDirectories[options.kind])

    yield* Effect.tryPromise(async () => await mkdir(typeDirectory, { recursive: true }))

    let runId = baseId
    let runDirectory =
      options.outputDirectory === undefined
        ? path.join(typeDirectory, runId)
        : path.resolve(options.outputDirectory)
    if (options.outputDirectory === undefined) {
      let collision = 1
      while (yield* Effect.promise(async () => await pathExists(runDirectory))) {
        runId = `${baseId}-${collision.toString().padStart(2, '0')}`
        runDirectory = path.join(typeDirectory, runId)
        collision += 1
      }
    }

    yield* Effect.tryPromise(async () => {
      await mkdir(path.dirname(runDirectory), { recursive: true })
      await mkdir(runDirectory, { recursive: false })
    })

    return {
      artifactPath: path.join(runDirectory, artifactNames[options.kind]),
      kind: options.kind,
      logPath: path.join(runDirectory, 'run.log.jsonl'),
      reportPath: path.join(runDirectory, 'report.json'),
      runDirectory,
      runId: path.basename(runDirectory),
      startedAt: new Date(startedAtMillis).toISOString(),
      startedAtMillis,
    } satisfies ArtifactRun
  },
)

const referenceFromReport = async (
  runDirectory: string,
  kind: ArtifactKind,
  supportedVersions: readonly number[],
): Promise<ArtifactReference | undefined> => {
  const report = await readReport(path.join(runDirectory, 'report.json'))
  if (
    report?.status !== 'succeeded' ||
    report.artifact?.kind !== kind ||
    !supportedVersions.includes(report.artifact.formatVersion)
  ) {
    return undefined
  }

  const artifactPath = path.resolve(runDirectory, report.artifact.path)
  if (!(await pathExists(artifactPath))) {
    return undefined
  }

  return {
    ...report.artifact,
    path: artifactPath,
    runId: report.runId,
  } satisfies ArtifactReference
}

/** Finds the newest successful artifact whose report advertises a supported format version. */
export const latestCompatibleArtifact = Effect.fn('labs.latestCompatibleArtifact')(
  function* latestCompatibleArtifact(options: {
    readonly kind: ArtifactKind
    readonly supportedVersions: readonly number[]
    readonly workDirectory: string
  }) {
    const typeDirectory = path.join(options.workDirectory, artifactDirectories[options.kind])
    const entries = yield* Effect.tryPromise(async () => {
      try {
        return await readdir(typeDirectory, { withFileTypes: true })
      } catch {
        return []
      }
    })

    for (const entry of entries
      .filter((candidate) => candidate.isDirectory())
      .toSorted((left, right) => right.name.localeCompare(left.name))) {
      const reference = yield* Effect.promise(
        async () =>
          await referenceFromReport(
            path.join(typeDirectory, entry.name),
            options.kind,
            options.supportedVersions,
          ),
      )
      if (reference !== undefined) {
        return reference
      }
    }

    return yield* Effect.fail(
      new Error(`no successful compatible ${options.kind} artifact found in ${typeDirectory}`),
    )
  },
)

/** Resolves a run id, run directory, direct path, or extensionless legacy SQLite name. */
export const resolveArtifactReference = Effect.fn('labs.resolveArtifactReference')(
  function* resolveArtifactReference(options: {
    readonly kind: ArtifactKind
    readonly reference?: string
    readonly supportedVersions: readonly number[]
    readonly workDirectory: string
  }) {
    if (options.reference === undefined) {
      return yield* latestCompatibleArtifact(options)
    }

    const typeDirectory = path.join(options.workDirectory, artifactDirectories[options.kind])
    const direct = path.resolve(options.reference)
    const candidates = [
      direct,
      path.join(typeDirectory, options.reference),
      ...(options.kind === 'database'
        ? [
            path.join(options.workDirectory, 'databases', options.reference),
            path.join(options.workDirectory, 'databases', `${options.reference}.sqlite`),
            `${direct}.sqlite`,
          ]
        : []),
    ]

    for (const candidate of new Set(candidates)) {
      if (!(yield* Effect.promise(async () => await pathExists(candidate)))) {
        continue
      }

      const indexed = yield* Effect.promise(
        async () => await referenceFromReport(candidate, options.kind, options.supportedVersions),
      )
      if (indexed !== undefined) {
        return indexed
      }

      return {
        format: 'unindexed',
        formatVersion: options.supportedVersions[0] ?? 0,
        kind: options.kind,
        path: candidate,
      } satisfies ArtifactReference
    }

    return yield* Effect.fail(
      new Error(`could not resolve ${options.kind} input ${options.reference}`),
    )
  },
)

/** Selects the newest immutable production snapshot ZIP when extraction has no explicit input. */
export const latestSnapshotZip = Effect.fn('labs.latestSnapshotZip')(function* latestSnapshotZip() {
  const entries = yield* Effect.tryPromise(
    async () => await readdir(repositoryRoot, { withFileTypes: true }),
  )
  const matches = entries
    .filter(
      (entry) =>
        entry.isFile() && entry.name.startsWith('snapshot_') && entry.name.endsWith('.zip'),
    )
    .toSorted((left, right) => right.name.localeCompare(left.name))
  const [latest] = matches

  return latest === undefined
    ? yield* Effect.fail(new Error(`no snapshot_*.zip found in ${repositoryRoot}`))
    : path.join(repositoryRoot, latest.name)
})
