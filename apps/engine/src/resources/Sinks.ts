// * Queue of successful captures for product sinks.
// * Windowed-batch consumer (size | wait) — independent of Work capture tuning.
import * as Cloudflare from 'alchemy/Cloudflare'

export const Sinks = Cloudflare.Queues.Queue('Sinks')
