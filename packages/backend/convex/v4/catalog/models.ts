import { convexToZod, zodOutputToConvex } from 'convex-helpers/server/zod4'
import { docValidator } from 'convex/server'
import { v } from 'convex/values'
import { z } from 'zod'

import { query } from '../../_generated/server'
import type { MutationCtx } from '../../_generated/server'
import type { Scan, ScanPair } from '../scan'
import { changedRows } from './changes'
import { text, flag, strings, date, metadata } from './fields'
import { projectModel } from './project'
import { V4_CURRENT_MODELS_TABLE, currentModelsTable } from './table'
import type { CurrentModelRow } from './table'

/** Insert or replace model rows within the Catalog's mutation. */
export async function write(ctx: MutationCtx, rows: CurrentModelRow[]): Promise<void> {
  for (const row of rows) {
    const existing = await ctx.db
      .query(V4_CURRENT_MODELS_TABLE)
      .withIndex('by_model_id', (q) => q.eq('model_id', row.model_id))
      .unique()

    await (existing === null
      ? ctx.db.insert(V4_CURRENT_MODELS_TABLE, row)
      : ctx.db.replace(V4_CURRENT_MODELS_TABLE, existing._id, row))
  }
}

export function prepare(pair: ScanPair) {
  const project = (scan: Scan) =>
    new Map([...scan.models].map(([id, model]) => [id, projectModel(model, scan.scan_at)]))
  return changedRows(project(pair.previous), project(pair.next))
}

/** Interpret the model facts consumed by overview products. */
export const Model = convexToZod(docValidator(V4_CURRENT_MODELS_TABLE, currentModelsTable))
  .extend({
    or_created_at: date,
    metadata_json: metadata.pipe(
      z.object({
        description: text,
        author_display_name: text,
        hf_slug: text,
        knowledge_cutoff: text,
        supports_reasoning: flag,
        reasoning_config: z
          .object({ is_mandatory_reasoning: flag, supported_reasoning_efforts: strings })
          .nullable()
          .catch(null),
      }),
    ),
  })
  .transform(({ metadata_json: facts, ...identity }) => ({
    ...identity,
    description: facts.description,
    author_display_name: facts.author_display_name,
    hf_slug: facts.hf_slug,
    knowledge_cutoff: facts.knowledge_cutoff,
    supports_reasoning: facts.supports_reasoning,
    'reasoning_config.is_mandatory_reasoning':
      facts.reasoning_config?.is_mandatory_reasoning ?? null,
    'reasoning_config.supported_reasoning_efforts':
      facts.reasoning_config?.supported_reasoning_efforts ?? null,
  }))

/** Current or last-known model. */
export const get = query({
  args: { model_id: v.string() },
  returns: v.union(v.null(), zodOutputToConvex(Model)),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query(V4_CURRENT_MODELS_TABLE)
      .withIndex('by_model_id', (q) => q.eq('model_id', args.model_id))
      .unique()
    return row === null ? null : Model.parse(row)
  },
})
