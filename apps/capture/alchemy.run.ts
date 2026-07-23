import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'

import { Artifacts } from './src/artifacts.ts'
import Worker from './src/worker.ts'

// * ORCA Layer 0: capture worker + workflow + artifact store
export default Alchemy.Stack(
  'OrcaCapture',
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* stack() {
    const artifacts = yield* Artifacts
    const worker = yield* Worker

    return {
      artifactsBucketName: artifacts.bucketName,
      url: worker.url,
    }
  }),
)
