import { ConvexError } from 'convex/values'

import type { TableNames } from '../../_generated/dataModel'
import type { MutationCtx } from '../../_generated/server'
import { clock } from '../clock'

/** Partial initialization requires investigation/reset; this is not a resumable insert path. */
export async function assertInitialTableEmpty(ctx: MutationCtx, table: TableNames) {
  if ((await clock(ctx)) !== null || (await ctx.db.query(table).first()) !== null) {
    throw new ConvexError({
      message: 'Initialization requires empty tables; inspect/reset partial initialization',
      table,
    })
  }
}
