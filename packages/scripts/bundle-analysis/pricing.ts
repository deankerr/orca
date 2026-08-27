import { z } from 'zod'

import {
  DisplayPricingRowSchema,
  JsonObjectSchema,
  PricingSchema,
  TiersSchema,
} from './schemas/pricing.ts'
import type { EndpointPricingSource } from './schemas/pricing.ts'

export const EndpointPricingStateSchema = z.strictObject({
  classification: z.strictObject({
    display_pricing_kinds: z.array(z.string()),
    override_conditions: z.array(z.string()),
    pricing_display_kinds: z.array(z.string()),
  }),
  display_pricing: z.array(DisplayPricingRowSchema),
  endpoint_id: z.uuid(),
  model_id: z.string().min(1),
  pricing: PricingSchema,
  pricing_json: JsonObjectSchema.optional(),
  pricing_version_id: z.string().min(1).optional(),
  provider_slug: z.string().min(1),
  tiers: TiersSchema.optional(),
})

export type EndpointPricingState = z.infer<typeof EndpointPricingStateSchema>

export function createPricingState(
  modelId: string,
  endpoint: EndpointPricingSource,
): EndpointPricingState {
  // Classify observed conditions without deciding which condition is active.
  const overrideConditions = new Set<'prompt_length' | 'time_window'>()
  for (const override of endpoint.pricing.overrides ?? []) {
    if (override.min_prompt_tokens !== undefined) {
      overrideConditions.add('prompt_length')
    }
    if (override.utc_start !== undefined || override.utc_end !== undefined) {
      overrideConditions.add('time_window')
    }
  }

  return EndpointPricingStateSchema.parse({
    classification: {
      display_pricing_kinds: [
        ...new Set(endpoint.display_pricing.map((row) => row.kind)),
      ].toSorted(),
      override_conditions: [...overrideConditions].toSorted(),
      pricing_display_kinds: [
        ...new Set(endpoint.pricing.display_pricing.map((row) => row.kind)),
      ].toSorted(),
    },
    display_pricing: endpoint.display_pricing,
    endpoint_id: endpoint.id,
    model_id: modelId,
    pricing: endpoint.pricing,
    ...(endpoint.pricing_json === undefined ? {} : { pricing_json: endpoint.pricing_json }),
    ...(endpoint.pricing_version_id === undefined
      ? {}
      : { pricing_version_id: endpoint.pricing_version_id }),
    provider_slug: endpoint.provider_slug,
    ...(endpoint.tiers === undefined ? {} : { tiers: endpoint.tiers }),
  })
}
