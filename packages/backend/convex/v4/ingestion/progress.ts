import { withoutSystemFields } from 'convex-helpers'
import { v } from 'convex/values'

import { internalQuery } from '../../_generated/server'
import { catalogScanAt } from './clock'
import { nextModuleStep } from './state'
import { cursorsTable, moduleName, V4_CURSORS_TABLE } from './table'

/** Read-only inspection: latest declared Catalog scan, or null before initialization. */
export const getCatalogScanAt = internalQuery({
  args: {},
  returns: v.union(v.null(), v.string()),
  handler: async (ctx) => await catalogScanAt(ctx),
})

/** Read-only inspection: each started module's cursor; null means its baseline is pending. */
export const listModuleCursors = internalQuery({
  args: {},
  returns: v.array(cursorsTable.validator),
  handler: async (ctx) => {
    const rows = await ctx.db.query(V4_CURSORS_TABLE).collect()
    return rows.map(withoutSystemFields)
  },
})

/** Orchestration query: select one module step without advancing its cursor. */
export const getNextModuleStep = internalQuery({
  args: { module: moduleName, latestOnly: v.boolean() },
  returns: v.union(
    v.null(),
    v.object({
      cursor: v.union(v.null(), v.string()),
      from_scan_at: v.union(v.null(), v.string()),
      scan_at: v.string(),
    }),
  ),
  handler: async (ctx, { module, latestOnly }) => await nextModuleStep(ctx, module, { latestOnly }),
})
