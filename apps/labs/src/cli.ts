import * as Effect from 'effect/Effect'
import * as Argument from 'effect/unstable/cli/Argument'
import * as Command from 'effect/unstable/cli/Command'
import * as Flag from 'effect/unstable/cli/Flag'

import { buildCorpus, isCompressionLevel } from './corpus/build.ts'
import { buildDatabase } from './database/build.ts'
import { extractSnapshot, readSnapshotCrawls } from './snapshot.ts'

// ── shared inputs ──────────────────────────────────────────────────────────────────────────────

const outputFlag = Flag.directory('output').pipe(
  Flag.withAlias('o'),
  Flag.withDescription('Output directory'),
)

const snapshotZipArgument = Argument.file('snapshot', { mustExist: true }).pipe(
  Argument.withDescription('Convex snapshot ZIP'),
)

// ── snapshot preparation ───────────────────────────────────────────────────────────────────────

const extract = Command.make('extract', {
  output: outputFlag,
  snapshotZip: snapshotZipArgument,
}).pipe(
  Command.withDescription('Extract reusable crawl inputs from a Convex snapshot'),
  Command.withHandler((input) =>
    extractSnapshot({ outputDirectory: input.output, snapshotPath: input.snapshotZip }),
  ),
)

const snapshotDirectoryArgument = Argument.directory('snapshot-directory', {
  mustExist: true,
}).pipe(Argument.withDescription('Extracted snapshot directory'))

const inspect = Command.make('inspect', { snapshotDirectory: snapshotDirectoryArgument }).pipe(
  Command.withDescription('Summarize crawl inputs without reading their blobs'),
  Command.withHandler(
    Effect.fnUntraced(function* inspect(input) {
      const crawls = yield* readSnapshotCrawls(input.snapshotDirectory)
      yield* Effect.logInfo('snapshot summary').pipe(
        Effect.annotateLogs({
          crawls: crawls.length,
          first: crawls[0]?.crawlId ?? 'none',
          last: crawls.at(-1)?.crawlId ?? 'none',
          obviousEmptyCatalogs: crawls.filter((crawl) => crawl.totals.models === 0).length,
        }),
      )
    }),
  ),
)

const snapshot = Command.make('snapshot').pipe(
  Command.withDescription('Prepare and inspect snapshot inputs'),
  Command.withSubcommands([extract, inspect]),
)

// ── corpus construction ────────────────────────────────────────────────────────────────────────

const jobsFlag = Flag.integer('jobs').pipe(
  Flag.withAlias('j'),
  Flag.withDescription(
    'Maximum overlapping snapshot blob reads; CPU transforms stay single-threaded',
  ),
  Flag.withDefault(4),
)
const overwriteFlag = Flag.boolean('overwrite').pipe(
  Flag.withDescription('Replace an existing output corpus after a successful build'),
)
const compressionLevelFlag = Flag.integer('compression-level').pipe(
  Flag.withDescription('Zstandard compression level from 0 (fastest) to 9 (smallest)'),
  Flag.withDefault(1),
)
const shardSizeFlag = Flag.integer('shard-size').pipe(
  Flag.withDescription('Maximum source crawls per compressed shard'),
  Flag.withDefault(256),
)
const corpusLimitFlag = Flag.integer('limit').pipe(
  Flag.withDescription('Process only the first N snapshot crawls'),
  Flag.optional,
)
const build = Command.make('build', {
  compressionLevel: compressionLevelFlag,
  jobs: jobsFlag,
  limit: corpusLimitFlag,
  output: outputFlag,
  overwrite: overwriteFlag,
  shardSize: shardSizeFlag,
  snapshotDirectory: snapshotDirectoryArgument,
}).pipe(
  Command.withDescription('Clean and repack snapshot crawls into a reusable corpus'),
  Command.withHandler((input) => {
    if (input.jobs < 1) {
      return Effect.fail(new Error('--jobs must be positive'))
    }
    if (!isCompressionLevel(input.compressionLevel)) {
      return Effect.fail(new Error('--compression-level must be between 0 and 9'))
    }
    if (input.shardSize < 1) {
      return Effect.fail(new Error('--shard-size must be positive'))
    }
    if (input.limit._tag === 'Some' && input.limit.value < 1) {
      return Effect.fail(new Error('--limit must be positive'))
    }
    return buildCorpus({
      compressionLevel: input.compressionLevel,
      jobs: input.jobs,
      limit: input.limit._tag === 'Some' ? input.limit.value : undefined,
      outputDirectory: input.output,
      overwrite: input.overwrite,
      shardSize: input.shardSize,
      snapshotDirectory: input.snapshotDirectory,
    })
  }),
)
const corpus = Command.make('corpus').pipe(
  Command.withDescription('Build deduplicated, sharded analysis corpora'),
  Command.withSubcommands([build]),
)

// ── product database replay ────────────────────────────────────────────────────────────────────

const corpusDirectoryArgument = Argument.directory('corpus-directory', { mustExist: true }).pipe(
  Argument.withDescription('Sharded Labs corpus directory'),
)
const databaseOutputFlag = Flag.file('output').pipe(
  Flag.withAlias('o'),
  Flag.withDescription('Output SQLite database'),
)
const limitFlag = Flag.integer('limit').pipe(
  Flag.withDescription('Process only the first N accepted crawls'),
  Flag.optional,
)
const buildDb = Command.make('build', {
  corpusDirectory: corpusDirectoryArgument,
  limit: limitFlag,
  output: databaseOutputFlag,
}).pipe(
  Command.withDescription('Replay a corpus into a local product database'),
  Command.withHandler((input) => {
    if (input.limit._tag === 'Some' && input.limit.value < 1) {
      return Effect.fail(new Error('--limit must be positive'))
    }
    return buildDatabase({
      corpusDirectory: input.corpusDirectory,
      limit: input.limit._tag === 'Some' ? input.limit.value : undefined,
      outputPath: input.output,
    })
  }),
)
const database = Command.make('db').pipe(
  Command.withDescription('Build disposable local product databases'),
  Command.withSubcommands([buildDb]),
)

// ── root ────────────────────────────────────────────────────────────────────────────────────────

export const cli = Command.make('labs').pipe(
  Command.withDescription('Reproducible ORCA data experiments and product research'),
  Command.withSubcommands([snapshot, corpus, database]),
)
