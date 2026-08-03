import { format } from 'node:util'

import * as Effect from 'effect/Effect'

import {
  ArchiveError,
  DEFAULT_EXPORT_DIRECTORY,
  DEFAULT_WORK_DIRECTORY,
  inspect,
  materialize,
  readCrawls,
} from './archive.ts'
import { materializeSqlite } from './core-sqlite.ts'
import { replayHistory } from './history/replay.ts'
import { scanSchemas } from './schema-observer.ts'

const usage = `Archive archeology tools

Usage:
  bun run archive inspect [export-directory]
  bun run archive crawls [export-directory] [limit]
  bun run archive materialize <crawl-id> [export-directory] [work-directory]
  bun run archive scan [limit] [export-directory] [output-path]
  bun run archive sqlite <crawl-id> [export-directory] [database-path]
  bun run archive history [limit] [export-directory] [database-path]

Defaults:
  export-directory  ${DEFAULT_EXPORT_DIRECTORY}
  work-directory    ${DEFAULT_WORK_DIRECTORY}
`

const print = (value: unknown) => {
  console.log(format(value))
}

// Each branch is independent command dispatch; splitting it would hide the complete CLI surface.
// oxlint-disable-next-line eslint/complexity
const program = Effect.gen(function* program() {
  const [command, ...args] = Bun.argv.slice(2)

  switch (command) {
    case undefined: {
      console.log(usage)
      break
    }
    case 'inspect': {
      print(yield* inspect(args[0] ?? DEFAULT_EXPORT_DIRECTORY))
      break
    }
    case 'crawls': {
      const crawls = yield* readCrawls(args[0] ?? DEFAULT_EXPORT_DIRECTORY)
      const limit = Number(args[1] ?? 20)

      if (!Number.isSafeInteger(limit) || limit < 1) {
        yield* Effect.fail(new ArchiveError('limit must be a positive integer'))
      }

      for (const crawl of crawls.slice(-limit)) {
        print({
          blobBytes: crawl.data.size.blob,
          crawlId: crawl.crawl_id,
          rawBytes: crawl.data.size.raw,
          storageId: crawl.storage_id,
          totals: crawl.data.totals,
        })
      }
      break
    }
    case 'materialize': {
      const [crawlId] = args
      if (crawlId === undefined) {
        yield* Effect.fail(new ArchiveError('materialize requires a crawl id'))
      } else {
        const [exportDirectory = DEFAULT_EXPORT_DIRECTORY, workDirectory = DEFAULT_WORK_DIRECTORY] =
          args.slice(1)
        print(yield* materialize(exportDirectory, workDirectory, crawlId))
      }
      break
    }
    case 'scan': {
      const limit = args[0] === undefined ? undefined : Number(args[0])
      if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) {
        yield* Effect.fail(new ArchiveError('scan limit must be a positive integer'))
      }
      const result = yield* scanSchemas({
        exportDirectory: args[1],
        limit,
        outputPath: args[2],
      })
      print({
        outputPath: result.outputPath,
        range: result.report.range,
        stats: result.report.stats,
      })
      break
    }
    case 'sqlite': {
      const [crawlId, exportDirectory, databasePath] = args
      if (crawlId === undefined) {
        yield* Effect.fail(new ArchiveError('sqlite requires a crawl id'))
      } else {
        const result = yield* materializeSqlite({ crawlId, databasePath, exportDirectory })
        print({
          databasePath: result.databasePath,
          endpointFetchFailures: result.batch.endpointFetchFailures,
          endpoints: result.batch.endpoints.length,
          models: result.batch.models.length,
        })
      }
      break
    }
    case 'history': {
      const limit = args[0] === undefined ? undefined : Number(args[0])
      if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) {
        yield* Effect.fail(new ArchiveError('history limit must be a positive integer'))
      }
      print(
        yield* replayHistory({
          databasePath: args[2],
          exportDirectory: args[1],
          limit,
        }),
      )
      break
    }
    default: {
      console.log(usage)
    }
  }
})

try {
  await Effect.runPromise(program)
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
