import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'

import { Substrate } from './src/substrate.ts'
import Worker from './src/worker.ts'

// * The artifact pool: producers append, consumers read past their own cursor, and cadence is a
// * dial rather than a property of the architecture. See notes/data-architecture/artifact-pool.md.
export default Alchemy.Stack(
  'OrcaPool',
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* stack() {
    const substrate = yield* Substrate
    const worker = yield* Worker(substrate)

    return {
      bucket: substrate.bucket.bucketName,
      catalogUri: substrate.catalog.catalogUri,
      stream: substrate.stream.name,
      table: 'pool.observations',
      url: worker.url,
      warehouse: substrate.catalog.name,
    }
  }),
)
