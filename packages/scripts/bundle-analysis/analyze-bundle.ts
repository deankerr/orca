import { z } from 'zod'

import type { LoadedModelEndpointsV1 } from '../model-endpoints-v1.ts'
import { createPricingState, EndpointPricingStateSchema } from './pricing.ts'
import type { EndpointPricingState } from './pricing.ts'
import { EndpointSchema } from './schemas/endpoint.ts'
import { ModelSchema } from './schemas/model.ts'

export const AnalyzedBundleSchema = z.strictObject({
  crawl_at: z.iso.datetime(),
  crawl_id: z.string().min(1),
  pricing_states: z.array(EndpointPricingStateSchema),
  source: z.strictObject({
    path: z.string().min(1),
  }),
  verified_endpoint_count: z.number().int().nonnegative(),
})

export type AnalyzedBundle = z.infer<typeof AnalyzedBundleSchema>

export function analyzeBundle({ bundle, path }: LoadedModelEndpointsV1): AnalyzedBundle {
  const modelIds = new Set<string>()
  const endpointIds = new Set<string>()
  const pricingStates: EndpointPricingState[] = []
  let verifiedEndpointCount = 0

  // Identity verification prevents ambiguous endpoint joins later.
  for (const [entryIndex, entry] of bundle.data.entries()) {
    if (modelIds.has(entry.model_id)) {
      throw new Error(`Duplicate model_id ${entry.model_id} in ${path}`)
    }
    modelIds.add(entry.model_id)

    // Verify the complete model before checking invariants against its endpoints.
    const model = ModelSchema.safeParse(entry.model)
    if (!model.success) {
      throw new Error(
        `Invalid model ${entry.model_id} at data[${entryIndex}].model in ${path}:\n${z.prettifyError(model.error)}`,
      )
    }

    for (const [endpointIndex, rawEndpoint] of (entry.endpoints ?? []).entries()) {
      if (endpointIds.has(rawEndpoint.id)) {
        throw new Error(`Duplicate endpoint id ${rawEndpoint.id} in ${path}`)
      }
      endpointIds.add(rawEndpoint.id)

      // Parse every endpoint before deriving its pricing state.
      const endpoint = EndpointSchema.safeParse(rawEndpoint)
      if (!endpoint.success) {
        throw new Error(
          `Invalid endpoint for model ${entry.model_id}, endpoint ${rawEndpoint.id} at data[${entryIndex}].endpoints[${endpointIndex}] in ${path}:\n${z.prettifyError(endpoint.error)}`,
        )
      }
      verifiedEndpointCount += 1

      pricingStates.push(createPricingState(entry.model_id, endpoint.data))
    }
  }

  return AnalyzedBundleSchema.parse({
    crawl_at: bundle.crawl_at,
    crawl_id: bundle.crawl_id,
    pricing_states: pricingStates.toSorted(comparePricingStateIdentity),
    source: { path },
    verified_endpoint_count: verifiedEndpointCount,
  })
}

function comparePricingStateIdentity(
  left: EndpointPricingState,
  right: EndpointPricingState,
): number {
  return (
    left.model_id.localeCompare(right.model_id) || left.endpoint_id.localeCompare(right.endpoint_id)
  )
}
