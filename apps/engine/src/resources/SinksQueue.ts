// * Queue of successful captures for product sinks.
import * as Cloudflare from 'alchemy/Cloudflare'

export const SinksQueue = Cloudflare.Queues.Queue('SinksQueue')
