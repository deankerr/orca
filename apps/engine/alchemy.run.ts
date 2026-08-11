import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'

import { Entities } from './src/resources/Entities.ts'
import { Observations } from './src/resources/Observations.ts'
import { Sinks } from './src/resources/Sinks.ts'
import { Work } from './src/resources/Work.ts'
import Engine from './src/worker.ts'

// * Engine stack: Worker (cron + Work + Sinks + ops HTTP), Observations R2, queues, Entities D1.
export default Alchemy.Stack(
  'OrcaEngine',
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* stack() {
    const observations = yield* Observations
    const work = yield* Work
    const sinks = yield* Sinks
    const entities = yield* Entities
    const engine = yield* Engine

    return {
      bucketName: observations.bucketName,
      databaseName: entities.databaseName,
      sinksQueueName: sinks.queueName,
      url: engine.url,
      workQueueName: work.queueName,
    }
  }),
)
