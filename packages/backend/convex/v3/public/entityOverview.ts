import { v } from 'convex/values'
import { z } from 'zod'

import { query } from '../../_generated/server'
import { V3_MODELS_VIEW_TABLE, V3_PROVIDERS_VIEW_TABLE } from '../entities.table'

const text = z.string().trim().min(1).nullable().catch(null)
const flag = z.boolean().nullable().catch(null)
const strings = z.array(z.string()).nullable().catch(null)
const url = z
  .url({ protocol: /^https?$/ })
  .nullable()
  .catch(null)

export const ModelMetadata = z.object({
  description: text,
  author_display_name: text,
  hf_slug: text,
  knowledge_cutoff: text,
  supports_reasoning: flag,
  'reasoning_config.is_mandatory_reasoning': flag,
  'reasoning_config.supported_reasoning_efforts': strings,
})
export const ProviderMetadata = z.object({
  headquarters: text,
  datacenters: strings,
  statusPageUrl: url,
  'dataPolicy.termsOfServiceURL': url,
  'dataPolicy.privacyPolicyURL': url,
})

/** Model details for the overview, with unknown metadata represented as null. */
export const model = query({
  args: { modelId: v.string() },
  handler: async (ctx, { modelId }) => {
    const row = await ctx.db
      .query(V3_MODELS_VIEW_TABLE)
      .withIndex('by_model_id', (q) => q.eq('model_id', modelId))
      .unique()

    if (row === null) {
      return null
    }

    return {
      model_id: row.model_id,
      display_name: row.display_name,
      input_modalities: row.input_modalities,
      output_modalities: row.output_modalities,
      created_at: row.or_created_at,
      ...ModelMetadata.parse(row.metadata),
    }
  },
})

/** Provider details for the overview, without inferring endpoint policy. */
export const provider = query({
  args: { providerId: v.string() },
  handler: async (ctx, { providerId }) => {
    const row = await ctx.db
      .query(V3_PROVIDERS_VIEW_TABLE)
      .withIndex('by_provider_id', (q) => q.eq('provider_id', providerId))
      .unique()

    if (row === null) {
      return null
    }

    return {
      provider_id: row.provider_id,
      display_name: row.display_name,
      ...ProviderMetadata.parse(row.metadata),
    }
  },
})
