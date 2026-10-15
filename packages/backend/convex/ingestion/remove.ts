import { v } from 'convex/values'

import { internalAction } from '#generated/server'

import { IsoDateTime } from '../isodatetime'
import { ingestors } from './ingestors'
import { removalResult } from './results'
import type { RemovalResult } from './results'

/** Demo cleanup: wait for ingestion to finish first; this does not cancel in-flight work. */
export const run = internalAction({
  args: { scan_at: v.string() },
  returns: v.array(removalResult),
  handler: async (ctx, args): Promise<RemovalResult[]> => {
    const scan_at = IsoDateTime.parse(args.scan_at)

    return await Promise.all(ingestors.map(async (ingest) => await ingest.remove(ctx, { scan_at })))
  },
})
