import * as Command from 'effect/unstable/cli/Command'

import { buildCorpusCommand } from './programs/build-corpus.program.ts'
import { buildDatabaseCommand } from './programs/build-database.program.ts'
import { extractSnapshotCommand } from './programs/extract-snapshot.program.ts'
import { queryMonitorCommand } from './programs/query-monitor.program.ts'
import { queryPricingHistoryCommand } from './programs/query-pricing-history.program.ts'
import {
  reportCorpusCommand,
  reportDatabaseCommand,
  reportSnapshotCommand,
} from './programs/report-artifacts.program.ts'
import { WorkDirectory } from './programs/shared.ts'

const snapshot = Command.make('snapshot').pipe(
  Command.withDescription('Prepare and inspect snapshot inputs'),
  Command.withSubcommands([extractSnapshotCommand, reportSnapshotCommand]),
)

const corpus = Command.make('corpus').pipe(
  Command.withDescription('Build and inspect deduplicated, sharded corpora'),
  Command.withSubcommands([buildCorpusCommand, reportCorpusCommand]),
)

const database = Command.make('db').pipe(
  Command.withDescription('Build, inspect, and query local product databases'),
  Command.withSubcommands([
    buildDatabaseCommand,
    reportDatabaseCommand,
    queryMonitorCommand,
    queryPricingHistoryCommand,
  ]),
)

export const cli = Command.make('labs').pipe(
  Command.withDescription('Reproducible ORCA data experiments and product research'),
  Command.withSubcommands([snapshot, corpus, database]),
  Command.withGlobalFlags([WorkDirectory]),
)
