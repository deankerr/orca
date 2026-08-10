import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'

import { CurrentDatabase } from './src/resources/CurrentDatabase.ts'
import { Endpoints } from './src/resources/Endpoints.ts'
import { Responses } from './src/resources/Responses.ts'
import Engine from './src/worker.ts'

// * Stack inventory: Worker (cron + queue consumer + API), R2 archive, endpoints queue, D1 current
// * cache. Bucket/queue are also yielded inside the Worker for bindings; yielding them here exposes
// * names in stack outputs without a second provision (same resource FQN).
export default Alchemy.Stack(
  'OrcaEngine',
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* stack() {
    const responses = yield* Responses
    const endpoints = yield* Endpoints
    const current = yield* CurrentDatabase
    const engine = yield* Engine

    return {
      bucketName: responses.bucketName,
      databaseName: current.databaseName,
      queueName: endpoints.queueName,
      url: engine.url,
    }
  }),
)
