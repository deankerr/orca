import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'

import { Store } from './src/store.ts'
import Worker from './src/worker.ts'

// * Prototype of the normalized store: SCD2 entity versions over the Layer 1 canonical output.
export default Alchemy.Stack(
  'OrcaStore',
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* stack() {
    const store = yield* Store
    const worker = yield* Worker

    return {
      databaseName: store.databaseName,
      url: worker.url,
    }
  }),
)
