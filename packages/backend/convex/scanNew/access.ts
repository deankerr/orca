import type { ActionCtx } from '#generated/server'
import * as objects from '#objects'

import { createScanReader } from './reader'

/** Objects continues to own storage and source selection. */
export function reader(ctx: ActionCtx) {
  return createScanReader({
    loadMany: async (identities) => await objects.loadMany(ctx, identities),
    namesAtOrAfter: async (selection) => await objects.namesAtOrAfter(ctx, selection),
  })
}
