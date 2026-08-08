import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'

import { CurrentDatabase } from './src/database.ts'
import Engine from './src/worker.ts'

// * The engine: a cron that plans a crawl, a queue that paces it, a bucket of responses, and a D1
// * current observation cache. The bucket and queue are declared inside the Worker — see
// * ./src/worker.ts. The database is a sibling resource so migrations apply on deploy (and on
// * local `alchemy dev`).
export default Alchemy.Stack(
  'OrcaEngine',
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* stack() {
    const current = yield* CurrentDatabase
    const engine = yield* Engine

    return {
      databaseName: current.databaseName,
      url: engine.url,
    }
  }),
)
