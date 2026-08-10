// * R2 bucket for raw capture evidence. Temporal-major keys: {observedAt}/{scopeKey}.
// * One observation = one object. Re-sampling a scope later is a new key, never an overwrite policy.
import * as Cloudflare from 'alchemy/Cloudflare'

export const Observations = Cloudflare.R2.Bucket('Observations')
