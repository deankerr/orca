import type { DocumentByName, WithoutSystemFields } from 'convex/server'
import { v } from 'convex/values'

import type { DataModel } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'

export const applyResult = v.object({ upserted: v.number(), deleted: v.number() })
export const appendResult = v.object({ inserted: v.number() })

type ViewTable = 'meps2_models' | 'meps2_endpoints' | 'meps2_providers'
type AppendTable = 'meps2_pricing' | 'meps2_stats'

export async function tableHasRows(ctx: QueryCtx, table: ViewTable) {
  return (await ctx.db.query(table).first()) !== null
}

export async function insertRows<TableName extends AppendTable>(
  ctx: MutationCtx,
  table: TableName,
  rows: WithoutSystemFields<DocumentByName<DataModel, TableName>>[],
) {
  let inserted = 0
  for (const row of rows) {
    await ctx.db.insert(table, row)
    inserted += 1
  }
  return { inserted }
}
