// * Full sample: catalog → store catalog → enqueue every crawlable scope with shared observedAt.
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'

import * as Key from './key.ts'
import * as OpenRouter from './openrouter.ts'
import type { Store } from './store.ts'
import { workList } from './work-message.ts'
import type { WorkMessage } from './work-message.ts'

const QUEUE_BATCH_SIZE = 100

const chunks = <A>(items: ReadonlyArray<A>, size: number): A[][] => {
  const out: A[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}

export type PlanStarted = {
  readonly observedAt: string
  readonly models: number
  readonly queued: number
}

export const startFullSample = (deps: {
  store: Store
  sendBatch: (messages: ReadonlyArray<{ body: WorkMessage }>) => Effect.Effect<void>
}) =>
  Effect.gen(function* startFullSample() {
    const observedAt = Key.observedAtKey(yield* DateTime.now)
    const { body, models } = yield* OpenRouter.catalog()

    yield* deps.store.putCatalog({ body, observedAt })

    const messages = workList(models, observedAt)
    for (const chunk of chunks(messages, QUEUE_BATCH_SIZE)) {
      yield* deps.sendBatch(chunk.map((body) => ({ body })))
    }

    yield* Effect.log(
      `full sample ${observedAt}: queued ${messages.length} of ${models.length} catalog models`,
    )
    return {
      models: models.length,
      observedAt,
      queued: messages.length,
    } satisfies PlanStarted
  })
