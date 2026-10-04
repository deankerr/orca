import { ConvexError } from 'convex/values'

import type { ActionCtx } from '../_generated/server'
import * as objects from '../objects'
import type { RawScan } from './collected'
import { createScanReader, encodeScan } from './objects'

export type { Scan, ScanPair, ScannedModel, ScannedEndpoint, ScannedProvider } from './schema'

/** Store collected data; Objects owns compression, locators and the write backend. */
export async function store(ctx: ActionCtx, scan: RawScan): Promise<void> {
  if (scan.entries.length === 0) {
    throw new ConvexError('Cannot store an empty scan')
  }

  await objects.store(ctx, encodeScan(scan))
}

/** Read scans through the app's configured Objects source. */
export function reader(ctx: ActionCtx) {
  return createScanReader({
    loadMany: async (identities) => await objects.loadMany(ctx, identities),
    namesAtOrAfter: async (selection) => await objects.namesAtOrAfter(ctx, selection),
  })
}
