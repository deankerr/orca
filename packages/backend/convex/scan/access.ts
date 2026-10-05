import { ConvexError } from 'convex/values'

import type { ActionCtx } from '#generated/server'
import * as objects from '#objects'

import type { RawScan } from './collected'
import { createScanReader, encodeScan } from './reader'

/** Store collected data; Objects owns compression, locators and the write backend. */
export async function store(ctx: ActionCtx, scan: RawScan): Promise<void> {
  if (scan.entries.length === 0) {
    throw new ConvexError('Cannot store an empty scan')
  }

  await objects.store(ctx, encodeScan(scan))
}

/** Read stored scans; Objects owns storage and source selection. */
export function reader(ctx: ActionCtx) {
  return createScanReader({
    loadMany: async (identities) => await objects.loadMany(ctx, identities),
    namesAtOrAfter: async (selection) => await objects.namesAtOrAfter(ctx, selection),
  })
}
