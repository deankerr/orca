import type { DocumentByName, WithoutSystemFields } from 'convex/server'
import { v } from 'convex/values'

import type { DataModel } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'

/** Return shape for view upsert chunks. */
export const upsertResult = v.object({ upserted: v.number() })
/** Return shape for endpoint unlist chunks. */
export const unlistResult = v.object({ unlisted: v.number() })
/** Return shape for series insert chunks. */
export const appendResult = v.object({ inserted: v.number() })

type ViewTable = 'meps2_models' | 'meps2_endpoints' | 'meps2_providers'

/** True if the view has at least one row. Empty means rewrite `after` as upserts. */
export async function tableHasRows(ctx: QueryCtx, table: ViewTable) {
  return (await ctx.db.query(table).first()) !== null
}

/**
 * Insert-only series write. Existing unique key returns 0; missing inserts and
 * returns 1.
 */
export async function insertIfAbsent<TableName extends 'meps2_pricing' | 'meps2_stats'>(
  ctx: MutationCtx,
  table: TableName,
  existing: DocumentByName<DataModel, TableName> | null,
  row: WithoutSystemFields<DocumentByName<DataModel, TableName>>,
) {
  if (existing !== null) {
    return 0
  }

  await ctx.db.insert(table, row)
  return 1
}
