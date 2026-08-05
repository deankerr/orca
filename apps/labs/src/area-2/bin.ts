import path from 'node:path'

import * as BunRuntime from '@effect/platform-bun/BunRuntime'
import * as BunServices from '@effect/platform-bun/BunServices'
import type { CoreEndpoint, CoreModel } from '@orca/schema/area-2-core.ts'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Command from 'effect/unstable/cli/Command'
import * as Flag from 'effect/unstable/cli/Flag'
import { atomizeChangeset, diff } from 'json-diff-ts'

import { readBundles, validateBundle } from './bundle-reader.ts'
import type { JsonRecord } from './bundle-reader.ts'
import { materialize } from './materialize.ts'

const archivePath = path.resolve(
  import.meta.dir,
  '../../../../.labs-work/archives/2026-08-04T08-21-47Z/bundles.sqlite',
)
const bundleLimitFlag = Flag.integer('limit').pipe(
  Flag.withDescription('Maximum bundles to replay'),
  Flag.withDefault(10),
)
const fromDateFlag = Flag.string('from').pipe(
  Flag.withDescription('Inclusive UTC date at which to start replay (YYYY-MM-DD)'),
  Flag.optional,
)

const startOfUtcDate = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined
  }

  const date = new Date(`${value}T00:00:00.000Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error('--from must be a valid UTC date in YYYY-MM-DD format')
  }
  return date.getTime().toString()
}

const stateFromBatch = (
  batch: ReturnType<typeof materialize>,
): {
  readonly endpoints: Readonly<Record<string, CoreEndpoint>>
  readonly models: Readonly<Record<string, CoreModel>>
} => ({
  endpoints: Object.fromEntries(batch.endpoints.map(({ endpoint }) => [endpoint.id, endpoint])),
  models: Object.fromEntries(batch.models.map((model) => [model.slug, model])),
})

const isTextOutput = (model: JsonRecord) => {
  const output = model.output_modalities
  return Array.isArray(output) && output.length === 1 && output[0] === 'text'
}

const main = async (options: { readonly fromCrawlId?: string; readonly limit: number }) => {
  let previous: ReturnType<typeof stateFromBatch> = { endpoints: {}, models: {} }
  let isBaseline = true

  for await (const bundle of readBundles(archivePath, options.limit, options.fromCrawlId)) {
    try {
      const scopes = validateBundle(bundle.bytes).filter(({ model }) => isTextOutput(model))

      if (scopes.length === 0) {
        console.log('batch has zero scopes', { crawlId: bundle.crawlId })
        continue
      }

      const batch = materialize(scopes)
      const next = stateFromBatch(batch)
      const changes = atomizeChangeset(diff(previous, next))
      previous = next

      if (isBaseline) {
        console.log({ crawlId: bundle.crawlId, n: changes.length, status: 'baseline' })
        isBaseline = false
        continue
      }

      if (changes.length === 0) {
        console.log({ changes, crawlId: bundle.crawlId, n: changes.length })
        continue
      }

      console.log({ changes, crawlId: bundle.crawlId, n: changes.length })
    } catch (error) {
      console.error({ crawlId: bundle.crawlId, error, status: 'skipped-invalid-bundle' })
      continue
    }
  }
}

const cli = Command.make('area-2', { from: fromDateFlag, limit: bundleLimitFlag }).pipe(
  Command.withDescription('Replay Area 2 bundle materialization and diffs'),
  Command.withHandler(({ from, limit }) => {
    if (limit < 1) {
      return Effect.fail(new Error('--limit must be positive'))
    }
    return Effect.sync(() => startOfUtcDate(Option.getOrUndefined(from))).pipe(
      Effect.flatMap((fromCrawlId) =>
        Effect.promise(async () => {
          await main({ fromCrawlId, limit })
        }),
      ),
    )
  }),
)

BunRuntime.runMain(Command.run(cli, { version: '0.1.0' }).pipe(Effect.provide(BunServices.layer)))
