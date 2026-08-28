import type { Infer } from 'convex/values'
import * as R from 'remeda'

import { internal } from '../../_generated/api'
import type { ActionCtx } from '../../_generated/server'
import type { statsTable } from '../tables/stats'
import type { Catalog } from './catalog'

const CHUNK = 40

type StatsRow = Infer<typeof statsTable.validator>

export function collectStatsRows(catalog: Catalog, timestamp: number): StatsRow[] {
  const rows: StatsRow[] = []

  for (const model_id of [...catalog.data.keys()].toSorted()) {
    const item = catalog.data.get(model_id)
    if (item === undefined || item.endpoints === null) {
      continue
    }

    for (const endpoint_id of [...item.endpoints.keys()].toSorted()) {
      const endpoint = item.endpoints.get(endpoint_id)
      if (endpoint === undefined || endpoint.stats === null) {
        continue
      }

      for (const tier of Object.keys(endpoint.stats).toSorted()) {
        const sample = endpoint.stats[tier]
        if (sample === undefined || Object.keys(sample).length === 0) {
          continue
        }

        rows.push({
          endpoint_id: endpoint.endpoint_id,
          timestamp,
          tier,
          sample,
        })
      }
    }
  }

  return rows
}

export async function appendCatalogStats(
  ctx: ActionCtx,
  args: { catalog: Catalog; timestamp: number },
) {
  const rows = collectStatsRows(args.catalog, args.timestamp)
  const chunks = R.chunk(rows, CHUNK)

  let inserted = 0
  for (const chunk of chunks) {
    const result = await ctx.runMutation(internal.meps2.scan.queries.appendStats, { rows: chunk })
    inserted += result.inserted
  }

  console.log('[meps2:project] stats', { inserted })
  return { inserted }
}
