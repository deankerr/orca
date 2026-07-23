import * as Cloudflare from 'alchemy/Cloudflare'

// * Layer 0 artifact store. Append-only; raw crawl observations land here.
export const Artifacts = Cloudflare.R2.Bucket('Artifacts')
