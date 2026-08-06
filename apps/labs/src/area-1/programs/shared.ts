import { SqliteClient } from '@effect/sql-sqlite-bun'
import * as Console from 'effect/Console'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Flag from 'effect/unstable/cli/Flag'
import * as GlobalFlag from 'effect/unstable/cli/GlobalFlag'
import type { SqlClient as SqlClientService } from 'effect/unstable/sql/SqlClient'

import { resolveWorkDirectory } from '../artifacts/workspace.ts'

export const WorkDirectory = GlobalFlag.setting('work-directory')({
  flag: Flag.directory('work-dir').pipe(
    Flag.withDescription('Labs workspace; defaults to ORCA_LABS_WORK_DIR or .labs-work'),
    Flag.optional,
  ),
})

export const configuredWorkDirectory = WorkDirectory.pipe(Effect.map(resolveWorkDirectory))

export const inputFlag = Flag.string('input').pipe(
  Flag.withAlias('i'),
  Flag.withDescription('Run id or direct input path; defaults to the latest compatible artifact'),
  Flag.optional,
)

export const labelFlag = Flag.string('label').pipe(
  Flag.withDescription('Human label appended to the timestamped run id'),
  Flag.optional,
)

export const outputFlag = Flag.directory('output').pipe(
  Flag.withAlias('o'),
  Flag.withDescription('Exact run directory override'),
  Flag.optional,
)

export const jsonFlag = Flag.boolean('json').pipe(
  Flag.withDescription('Print the stored report as JSON'),
)

/** Converts Effect CLI optional values once at the program boundary. */
export const optionalValue = <A>(option: Option.Option<A>) => Option.getOrUndefined(option)

/** Writes report data as stable, indented JSON. */
export const printJson = (value: unknown) => Console.log(JSON.stringify(value, null, 2))

/** Supplies the local read boundary used to inspect SQLite archive artifacts. */
export const provideReadOnlyDatabase =
  (databasePath: string) =>
  <A, E>(effect: Effect.Effect<A, E, SqlClientService>) =>
    effect.pipe(
      Effect.provide(
        SqliteClient.layer({ disableWAL: true, filename: databasePath, readonly: true }),
      ),
    )
