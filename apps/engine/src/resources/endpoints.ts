// * Crawl work queue (one model-variant per message). Resource id `Endpoints` is stack state —
// * do not rename.
import * as Cloudflare from 'alchemy/Cloudflare'

export const Endpoints = Cloudflare.Queues.Queue('Endpoints')
