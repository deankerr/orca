import { SqliteClient } from '@effect/sql-sqlite-bun'
import * as Effect from 'effect/Effect'
import * as Argument from 'effect/unstable/cli/Argument'
import * as Command from 'effect/unstable/cli/Command'
import * as Flag from 'effect/unstable/cli/Flag'
import type { SqlClient as SqlClientService } from 'effect/unstable/sql/SqlClient'

import { buildCorpus, isCompressionLevel } from './corpus/build.ts'
import { buildDatabase } from './database/build.ts'
import { monitorPage } from './product-query/monitor.ts'
import { pricingHistory } from './product-query/pricing.ts'
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
const databaseArgument = Argument.file('database', { mustExist: true }).pipe(
  Argument.withDescription('Labs product SQLite database'),
)
const printJson = (value: unknown) =>
  Effect.sync(() => {
    console.log(JSON.stringify(value, null, 2))
  })
const runReadOnly =
  (databasePath: string) =>
  <A, E>(effect: Effect.Effect<A, E, SqlClientService>) =>
    effect.pipe(
      Effect.provide(
        SqliteClient.layer({ disableWAL: true, filename: databasePath, readonly: true }),
      ),
    )

const monitorLimitFlag = Flag.integer('limit').pipe(
  Flag.withDescription('Maximum number of changed crawl batches'),
  Flag.withDefault(10),
)
const beforeFlag = Flag.string('before').pipe(
  Flag.withDescription('Exclusive crawl id cursor'),
  Flag.optional,
)
const modelFlag = Flag.string('model').pipe(
  Flag.withDescription('Only crawl batches containing this model slug'),
  Flag.optional,
)
const providerFlag = Flag.string('provider').pipe(
  Flag.withDescription('Only crawl batches containing this provider organization name'),
  Flag.optional,
)
const monitor = Command.make('monitor', {
  before: beforeFlag,
  databasePath: databaseArgument,
  limit: monitorLimitFlag,
  model: modelFlag,
  provider: providerFlag,
}).pipe(
  Command.withDescription('Print a product-shaped Monitor page'),
  Command.withHandler((input) => {
    if (input.limit < 1) {
      return Effect.fail(new Error('--limit must be positive'))
    }
    return monitorPage({
      ...(input.before._tag === 'Some' ? { before: input.before.value } : {}),
      limit: input.limit,
      ...(input.model._tag === 'Some' ? { modelSlug: input.model.value } : {}),
      ...(input.provider._tag === 'Some' ? { providerName: input.provider.value } : {}),
    }).pipe(runReadOnly(input.databasePath), Effect.flatMap(printJson))
  }),
)

const modelSlugArgument = Argument.string('model-slug').pipe(
  Argument.withDescription('Model slug whose endpoint pricing history should be read'),
)
const pricing = Command.make('pricing-history', {
  databasePath: databaseArgument,
  modelSlug: modelSlugArgument,
}).pipe(
  Command.withDescription('Print forward endpoint pricing periods for a model'),
  Command.withHandler((input) =>
    pricingHistory(input.modelSlug).pipe(
      runReadOnly(input.databasePath),
      Effect.flatMap(printJson),
    ),
  ),
)
const database = Command.make('db').pipe(
  Command.withDescription('Build and inspect disposable local product databases'),
  Command.withSubcommands([buildDb, monitor, pricing]),
)

// ── root ────────────────────────────────────────────────────────────────────────────────────────

export const cli = Command.make('labs').pipe(
  Command.withDescription('Reproducible ORCA data experiments and product research'),
  Command.withSubcommands([snapshot, corpus, database]),
)
