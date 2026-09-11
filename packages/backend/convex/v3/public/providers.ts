import { z } from 'zod'

import { query } from '../../_generated/server'
import { V3_PROVIDERS_VIEW_TABLE } from '../entities.table'

/** Lightweight provider details; endpoint-specific tags remain on endpoints. */
export const Provider = z.object({
  _id: z.string(),
  _creationTime: z.number(),
  provider_id: z.string(),
  display_name: z.string(),
})

export type Provider = z.infer<typeof Provider>

/** List lightweight provider summaries, including catalog-absent providers. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query(V3_PROVIDERS_VIEW_TABLE).collect()

    return rows.map((row) => Provider.parse(row))
  },
})
