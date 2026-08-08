// * The worker-side current-view cache database. Provisioned by Alchemy; migrations apply on deploy
// * (and on `alchemy dev` against the local D1 simulator).
// *
// * Hand-written SQL rather than a Drizzle schema layer: observation shape is Effect Schema + JSON
// * columns. The database stores scope keys, clocks, and opaque ScopeObservation documents — it
// * does not restate product fields as columns.
import * as Cloudflare from 'alchemy/Cloudflare'

export const CurrentDatabase = Cloudflare.D1.Database('Current', {
  migrationsDir: './migrations',
})
