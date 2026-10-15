import { v } from 'convex/values'

import { internalAction } from '#generated/server'
import * as scans from '#scans'

import { ingestResult } from './ingestor'
import type { IngestResult } from './ingestor'
import { ingestors } from './ingestors'
import { ingestArgs } from './input'
import type { ScanPair } from './input'

/** Load a supplied pair once; each process independently commits any outstanding output. */
export const run = internalAction({
  args: ingestArgs.fields,
  returns: v.array(ingestResult),
  handler: async (ctx, { from_scan_at, scan_at, has_later_scan }): Promise<IngestResult[]> => {
    const [previous, next] = await Promise.all([
      from_scan_at === null ? null : scans.load(ctx, from_scan_at),
      scans.load(ctx, scan_at),
    ])

    const pair: ScanPair = {
      previous: previous ?? {
        scan_at: null,
        models: new Map(),
        providers: new Map(),
        endpoints: new Map(),
        stats: [],
      },
      next,
      has_later_scan,
    }

    return await Promise.all(ingestors.map(async (ingest) => await ingest(ctx, pair)))
  },
})
