// * D1: current V2 model documents for the public API projection.
import * as Cloudflare from 'alchemy/Cloudflare'

export const PublicApiV2DB = Cloudflare.D1.Database('PublicApiV2DB', {
  migrationsDir: './migrations/public-api-v2',
})
