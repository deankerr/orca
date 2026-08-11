// * D1: first/last detected clocks for scopes and endpoint ids.
import * as Cloudflare from 'alchemy/Cloudflare'

export const Entities = Cloudflare.D1.Database('Entities', {
  migrationsDir: './migrations/entities',
})
