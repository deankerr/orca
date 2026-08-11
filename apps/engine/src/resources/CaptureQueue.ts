// * Queue of capture jobs. One message = one (permaslug, variant) sample attempt.
import * as Cloudflare from 'alchemy/Cloudflare'

export const CaptureQueue = Cloudflare.Queues.Queue('CaptureQueue')
