import type { DocumentByName, WithoutSystemFields } from 'convex/server'
import { v } from 'convex/values'

import type { DataModel } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'

export const upsertResult = v.object({ upserted: v.number() })
export const unlistResult = v.object({ unlisted: v.number() })
export const appendResult = v.object({ inserted: v.number() })

type ViewTable = 'meps2_models' | 'meps2_endpoints' | 'meps2_providers'

export async function tableHasRows(ctx: QueryCtx, table: ViewTable) {
  return (await ctx.db.query(table).first()) !== null
}

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
