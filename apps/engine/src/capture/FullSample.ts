// * Full sample: catalog → archive → CaptureQueue.
// * Policy: catalog must be HTTP 200 with validated model data or the sample aborts.
// * Crawl set: serving endpoint present, skip `~` aliases.
import type { RuntimeContext } from 'alchemy'
import type * as Cloudflare from 'alchemy/Cloudflare'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import * as Observations from '../observations/index.ts'
import type { CaptureJob } from './Message.ts'
import { OpenRouterClient } from './OpenRouter.ts'

/** Archive body: validated success envelope as a JSON string. */
const encodeDataEnvelope = Schema.encodeSync(
  Schema.fromJsonString(Schema.Struct({ data: Schema.Array(Schema.Unknown) })),
)

const QUEUE_BATCH_SIZE = 100

const chunks = <A>(items: ReadonlyArray<A>, size: number): A[][] => {
  const out: A[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}

export const make = (deps: {
  sendBatch: (
    messages: ReadonlyArray<{ body: CaptureJob }>,
  ) => Effect.Effect<void, Cloudflare.Queues.SendError, RuntimeContext>
}) =>
  Effect.all({
    archive: Observations.ObservationArchive,
    openRouter: OpenRouterClient,
  }).pipe(
    Effect.map(({ archive, openRouter }) =>
      Effect.gen(function* startFullSample() {
        const observedAt = Observations.observedAtKey(yield* DateTime.now)
        const catalog = yield* openRouter.fetchCatalog

        if (catalog._tag === 'HttpError') {
          return yield* Effect.die(new Error(`catalog returned ${catalog.status}: ${catalog.body}`))
        }

        // Persist only the validated success envelope.
        yield* archive.putCatalog({
          body: encodeDataEnvelope({ data: catalog.data }),
          observedAt,
        })

        const jobs: CaptureJob[] = []
        for (const model of catalog.data) {
          if (model.endpoint === null || model.slug.startsWith('~')) {
            continue
          }
          jobs.push({
            observedAt,
            permaslug: model.permaslug,
            variant: model.endpoint.variant,
          })
        }

        for (const chunk of chunks(jobs, QUEUE_BATCH_SIZE)) {
          yield* deps.sendBatch(chunk.map((body) => ({ body })))
        }

        yield* Effect.log('full-sample: queued').pipe(
          Effect.annotateLogs({
            models: String(catalog.data.length),
            observedAt,
            phase: 'full-sample',
            queued: String(jobs.length),
            status: String(catalog.status),
          }),
        )
        return {
          models: catalog.data.length,
          observedAt,
          queued: jobs.length,
        }
      }),
    ),
  )
