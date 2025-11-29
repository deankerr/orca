// * Field mappings for change transforms (validated against output types)

import { DataPolicyOutput, formatPrice, LimitsOutput, PricingOutput } from './endpoint'

const dataPolicyFieldMap: Record<string, keyof DataPolicyOutput> = {
  can_publish: 'may_publish_data',
  retains_prompts: 'may_retain_data',
  retains_prompts_days: 'data_retention_days',
  training: 'may_train_on_data',
  requires_user_ids: 'shares_user_id',
}

const pricingFieldMap: Record<string, keyof PricingOutput> = {
  cache_read: 'text_cache_read',
  cache_write: 'text_cache_write',
  audio_cache_input: 'audio_cache_write',
  internal_reasoning: 'reasoning_output',
  request: 'per_request',
}

const limitsFieldMap: Record<string, keyof LimitsOutput> = {
  // all field names match between input/output
}

// * Transform a change's path and values

export function transformEndpointChange(change: {
  path?: string
  path_level_1?: string
  path_level_2?: string
  before?: unknown
  after?: unknown
}) {
  if (!change.path) return change

  // Get the appropriate field map based on path_level_1
  const fieldMap =
    change.path_level_1 === 'data_policy'
      ? dataPolicyFieldMap
      : change.path_level_1 === 'pricing'
        ? pricingFieldMap
        : change.path_level_1 === 'limits'
          ? limitsFieldMap
          : null

  // Transform path if mapping exists
  const outputField = change.path_level_2 && fieldMap?.[change.path_level_2]
  const outputPath = outputField ? `${change.path_level_1}.${outputField}` : change.path

  // Transform pricing values to formatted strings
  const isPricing = change.path_level_1 === 'pricing'

  return {
    ...change,
    path: outputPath,
    path_level_2: outputField ?? change.path_level_2,
    before: isPricing ? formatPrice(change.before as number) : change.before,
    after: isPricing ? formatPrice(change.after as number) : change.after,
  }
}
