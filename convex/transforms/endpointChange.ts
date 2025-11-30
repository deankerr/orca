// * Field mappings for change transforms (validated against output types)

import { DataPolicyOutput, formatPrice, PricingOutput } from './endpoint'

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

// provider fields flatten to top level
const providerFieldMap: Record<string, string> = {
  tag_slug: 'provider_id',
  region: 'provider_region',
}

type VariablePricingInput = {
  threshold?: number
  text_input?: number
  text_output?: number
  cache_read?: number
  cache_write?: number
}

function transformVariablePricingTier(tier: VariablePricingInput) {
  return {
    tokens: tier.threshold,
    text_input: formatPrice(tier.text_input),
    text_output: formatPrice(tier.text_output),
    text_cache_read: formatPrice(tier.cache_read),
    text_cache_write: formatPrice(tier.cache_write),
  }
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

  // * provider fields flatten to top level
  if (change.path_level_1 === 'provider' && change.path_level_2) {
    const outputField = providerFieldMap[change.path_level_2]
    if (outputField) {
      return {
        ...change,
        path: outputField,
        path_level_1: outputField,
        path_level_2: undefined,
      }
    }
    return change
  }

  // * variable_pricings array transformation
  if (change.path_level_1 === 'variable_pricings') {
    const transformArray = (arr: unknown) =>
      Array.isArray(arr) ? arr.map(transformVariablePricingTier) : arr

    return {
      ...change,
      path: 'pricing.tiers',
      path_level_1: 'pricing',
      path_level_2: 'tiers',
      before: transformArray(change.before),
      after: transformArray(change.after),
    }
  }

  // * nested field mappings (data_policy, pricing)
  const fieldMap =
    change.path_level_1 === 'data_policy'
      ? dataPolicyFieldMap
      : change.path_level_1 === 'pricing'
        ? pricingFieldMap
        : null

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
