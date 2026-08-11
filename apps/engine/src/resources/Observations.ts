// * R2 bucket for raw capture evidence.
// * Endpoints: endpoints/{observedAt}/{scopeKey}.json.gz
// * Catalogs:  catalogs/{observedAt}.json.gz
import * as Cloudflare from 'alchemy/Cloudflare'

export const Observations = Cloudflare.R2.Bucket('Observations')
