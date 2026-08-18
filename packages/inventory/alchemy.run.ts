import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'

export default Alchemy.Stack(
  'OrcaInventory',
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* stack() {
    const bucket = yield* Cloudflare.R2.Bucket('InventoryData')
    return { bucketName: bucket.bucketName }
  }),
)
