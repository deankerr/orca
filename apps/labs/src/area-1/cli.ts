import * as Command from 'effect/unstable/cli/Command'

import { extractSnapshotCommand } from './programs/extract-snapshot.program.ts'
import { importBundleArchiveCommand } from './programs/import-bundle-archive.program.ts'
import { reportArchiveCommand, reportSnapshotCommand } from './programs/report-artifacts.program.ts'
import { WorkDirectory } from './programs/shared.ts'

const snapshot = Command.make('snapshot').pipe(
  Command.withDescription('Prepare and inspect snapshot inputs'),
  Command.withSubcommands([extractSnapshotCommand, reportSnapshotCommand]),
)

const archive = Command.make('archive').pipe(
  Command.withDescription('Import and inspect lossless raw bundle archives'),
  Command.withSubcommands([importBundleArchiveCommand, reportArchiveCommand]),
)

export const cli = Command.make('labs').pipe(
  Command.withDescription('Reproducible ORCA data experiments and product research'),
  Command.withSubcommands([snapshot, archive]),
  Command.withGlobalFlags([WorkDirectory]),
)
