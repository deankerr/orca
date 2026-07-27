import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'

import Engine from './src/worker.ts'

// * The engine: a cron that plans a crawl, a queue that paces it, and a bucket of responses.
// * The bucket and queue are declared inside the Worker — see ./src/worker.ts.
export default Alchemy.Stack(
  'OrcaEngine',
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* stack() {
    const engine = yield* Engine

    return { url: engine.url }
  }),
)
