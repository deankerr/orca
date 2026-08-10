// * D1: thin temporal index of known scopes and endpoint ids (first/last detected).
// * Not product availability, not a grid — only "we successfully saw this entity at time T".
import * as Cloudflare from 'alchemy/Cloudflare'

export const Entities = Cloudflare.D1.Database('Entities', {
  migrationsDir: './migrations/entities',
})
