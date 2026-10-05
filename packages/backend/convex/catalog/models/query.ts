import { convexToZod, zodOutputToConvex } from 'convex-helpers/server/zod4'
import { docValidator } from 'convex/server'
import { v } from 'convex/values'
import { z } from 'zod'

import { query } from '#generated/server'

import { textOrNull, flagOrNull, stringsOrNull, isoDate } from '../../fields'
import { JsonObjectFromString } from '../../json'
import { CURRENT_MODELS_TABLE, currentModelsTable } from './table'

/** Interpret the model facts consumed by overview products. */
export const Model = convexToZod(docValidator(CURRENT_MODELS_TABLE, currentModelsTable))
  .extend({
    or_created_at: isoDate,
    metadata_json: JsonObjectFromString.pipe(
      z.object({
        description: textOrNull,
        author_display_name: textOrNull,
        hf_slug: textOrNull,
        knowledge_cutoff: textOrNull,
        supports_reasoning: flagOrNull,
        reasoning_config: z
          .object({
            is_mandatory_reasoning: flagOrNull,
            supported_reasoning_efforts: stringsOrNull,
          })
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
      .query(CURRENT_MODELS_TABLE)
      .withIndex('by_model_id', (q) => q.eq('model_id', args.model_id))
      .unique()
    return row === null ? null : Model.parse(row)
  },
})
