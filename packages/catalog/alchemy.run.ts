import * as Alchemy from 'alchemy'
import * as Axiom from 'alchemy/Axiom'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import Worker from './src/Worker.ts'

export default Alchemy.Stack(
  'OrcaCatalog',
  {
    providers: Layer.merge(Cloudflare.providers(), Axiom.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* stack() {
    const worker = yield* Worker

    return {
      url: worker.url.as<string>(),
    }
  }),
)
