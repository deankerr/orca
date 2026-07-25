import * as Cloudflare from 'alchemy/Cloudflare'

// * The normalized store: a derived, rebuildable index over Layer 0/1 artifacts — not a system
// * of record. Schema lives in ./migrations, applied on every deploy in numeric-prefix order.
export const Store = Cloudflare.D1.Database('Store', { migrationsDir: './migrations' })
