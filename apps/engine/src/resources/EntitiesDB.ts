// * D1: first/last seen clocks for scopes and endpoint ids.
import * as Cloudflare from 'alchemy/Cloudflare'

export const EntitiesDB = Cloudflare.D1.Database('EntitiesDB', {
  migrationsDir: './migrations/entities',
})
