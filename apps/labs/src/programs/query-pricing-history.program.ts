import * as Effect from 'effect/Effect'
import * as Command from 'effect/unstable/cli/Command'

import { resolveArtifactReference } from '../artifacts/workspace.ts'
import { pricingHistory } from '../product-query/pricing.ts'
import {
  configuredWorkDirectory,
  inputFlag,
  modelSlugArgument,
  optionalValue,
  printJson,
  provideReadOnlyDatabase,
} from './shared.ts'

/** Reads chart-ready pricing periods from the latest database unless one is selected. */
export const queryPricingHistory = Effect.fn('labs.queryPricingHistory')(
  function* queryPricingHistory(options: {
    readonly input?: string
    readonly modelSlug: string
    readonly workDirectory: string
  }) {
    const database = yield* resolveArtifactReference({
      kind: 'database',
      reference: options.input,
      supportedVersions: [2],
      workDirectory: options.workDirectory,
    })
    return yield* pricingHistory(options.modelSlug).pipe(provideReadOnlyDatabase(database.path))
  },
)

export const queryPricingHistoryCommand = Command.make('pricing-history', {
  input: inputFlag,
  modelSlug: modelSlugArgument,
}).pipe(
  Command.withDescription('Print endpoint pricing periods from the latest product database'),
  Command.withHandler((input) =>
    Effect.gen(function* runQueryPricingHistoryCommand() {
      const workDirectory = yield* configuredWorkDirectory
      const history = yield* queryPricingHistory({
        input: optionalValue(input.input),
        modelSlug: input.modelSlug,
        workDirectory,
      })
      yield* printJson(history)
    }),
  ),
)
