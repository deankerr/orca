// * Queue of scopes to sample. One message = one (permaslug, variant) observation attempt.
import * as Cloudflare from 'alchemy/Cloudflare'

export const Work = Cloudflare.Queues.Queue('Work')
