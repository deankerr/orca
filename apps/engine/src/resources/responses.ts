// * Immutable observation archive bucket. Resource id `Responses` is stack state — do not rename.
import * as Cloudflare from 'alchemy/Cloudflare'

export const Responses = Cloudflare.R2.Bucket('Responses')
