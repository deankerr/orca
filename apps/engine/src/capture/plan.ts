// * Capture composition: full sample plan (catalog → archive → Work queue).
// * Policy: catalog must be HTTP 200 with validated model data or the sample aborts.
// * Crawl set: serving endpoint present, skip `~` aliases.
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'

import * as Key from '../observations/key.ts'
import type { Store } from '../observations/store.ts'
import type { WorkMessage } from './message.ts'
import * as OpenRouter from './openrouter.ts'

const QUEUE_BATCH_SIZE = 100

const chunks = <A>(items: ReadonlyArray<A>, size: number): A[][] => {
  const out: A[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}

export const startFullSample = (deps: {
  store: Store
  sendBatch: (messages: ReadonlyArray<{ body: WorkMessage }>) => Effect.Effect<void>
}) =>
  Effect.gen(function* startFullSample() {
    const observedAt = Key.observedAtKey(yield* DateTime.now)
    const catalog = yield* OpenRouter.fetchCatalog()

    if (catalog._tag === 'HttpError') {
      return yield* Effect.die(new Error(`catalog returned ${catalog.status}: ${catalog.body}`))
    }

    // Persist only the validated success envelope.
    yield* deps.store.putCatalog({
      body: JSON.stringify({ data: catalog.data }),
      observedAt,
    })

    const messages: WorkMessage[] = []
    for (const model of catalog.data) {
      if (model.endpoint === null || model.slug.startsWith('~')) {
        continue
      }
      messages.push({
        observedAt,
        permaslug: model.permaslug,
        variant: model.endpoint.variant,
      })
    }

    for (const chunk of chunks(messages, QUEUE_BATCH_SIZE)) {
      yield* deps.sendBatch(chunk.map((body) => ({ body })))
    }

    yield* Effect.log('plan: full sample queued').pipe(
      Effect.annotateLogs({
        models: String(catalog.data.length),
        observedAt,
        phase: 'plan',
        queued: String(messages.length),
        status: String(catalog.status),
      }),
    )
    return {
      models: catalog.data.length,
      observedAt,
      queued: messages.length,
    }
  })
