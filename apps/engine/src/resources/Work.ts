// * Queue of scopes to sample. One message = one (permaslug, variant) observation attempt.
// * Not tied to a plan file or day bucket — any producer can enqueue any scope at any time.
import * as Cloudflare from 'alchemy/Cloudflare'

export const Work = Cloudflare.Queues.Queue('Work')
