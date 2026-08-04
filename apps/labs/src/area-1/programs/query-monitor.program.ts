import * as Effect from 'effect/Effect'
import * as Command from 'effect/unstable/cli/Command'
import * as Flag from 'effect/unstable/cli/Flag'

import { resolveArtifactReference } from '../artifacts/workspace.ts'
import { monitorPage } from '../product-query/monitor.ts'
import {
  configuredWorkDirectory,
  inputFlag,
  optionalValue,
  printJson,
  provideReadOnlyDatabase,
} from './shared.ts'

const limitFlag = Flag.integer('limit').pipe(
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

/** Reads a product-shaped Monitor page from the latest database unless one is selected. */
export const queryMonitor = Effect.fn('labs.queryMonitor')(function* queryMonitor(options: {
  readonly before?: string
  readonly input?: string
  readonly limit: number
  readonly model?: string
  readonly provider?: string
  readonly workDirectory: string
}) {
  if (options.limit < 1) {
    return yield* Effect.fail(new Error('--limit must be positive'))
  }

  const database = yield* resolveArtifactReference({
    kind: 'database',
    reference: options.input,
    supportedVersions: [2],
    workDirectory: options.workDirectory,
  })
  return yield* monitorPage({
    ...(options.before === undefined ? {} : { before: options.before }),
    limit: options.limit,
    ...(options.model === undefined ? {} : { modelSlug: options.model }),
    ...(options.provider === undefined ? {} : { providerName: options.provider }),
  }).pipe(provideReadOnlyDatabase(database.path))
})

export const queryMonitorCommand = Command.make('monitor', {
  before: beforeFlag,
  input: inputFlag,
  limit: limitFlag,
  model: modelFlag,
  provider: providerFlag,
}).pipe(
  Command.withDescription('Print a Monitor page from the latest product database'),
  Command.withHandler((input) =>
    Effect.gen(function* runQueryMonitorCommand() {
      const workDirectory = yield* configuredWorkDirectory
      const page = yield* queryMonitor({
        before: optionalValue(input.before),
        input: optionalValue(input.input),
        limit: input.limit,
        model: optionalValue(input.model),
        provider: optionalValue(input.provider),
        workDirectory,
      })
      yield* printJson(page)
    }),
  ),
)
