// oxlint-disable sort-keys -- Serialized transition data follows source and reading order.

import { isDeepStrictEqual } from 'node:util'

import { z } from 'zod'

import type { AnalyzedBundle } from './analyze-bundle.ts'
import type { EndpointPricingState } from './pricing.ts'

const EndpointReferenceSchema = z.strictObject({
  endpoint_id: z.uuid(),
  model_id: z.string().min(1),
  provider_slug: z.string().min(1),
})

const EndpointChangeSchema = z.discriminatedUnion('kind', [
  EndpointReferenceSchema.extend({ kind: z.literal('endpoint_added') }),
  EndpointReferenceSchema.extend({ kind: z.literal('endpoint_removed') }),
  EndpointReferenceSchema.extend({
    changed_paths: z.array(z.string().min(1)).min(1),
    kind: z.literal('pricing_changed'),
  }),
])

export const TransitionSchema = z.strictObject({
  endpoint_changes: z.array(EndpointChangeSchema),
  from_crawl_id: z.string().min(1),
  to_crawl_id: z.string().min(1),
})

export type Transition = z.infer<typeof TransitionSchema>

export function deriveTransitions(bundles: readonly AnalyzedBundle[]): Transition[] {
  return bundles.slice(1).map((after, index) => {
    const before = bundles[index]
    if (before === undefined) {
      throw new Error('Missing bundle before adjacent transition.')
    }
    return compareBundles(before, after)
  })
}

function compareBundles(before: AnalyzedBundle, after: AnalyzedBundle): Transition {
  const beforeById = new Map(before.pricing_states.map((state) => [state.endpoint_id, state]))
  const afterById = new Map(after.pricing_states.map((state) => [state.endpoint_id, state]))
  const endpointIds = new Set([...beforeById.keys(), ...afterById.keys()])
  const endpointChanges: z.infer<typeof EndpointChangeSchema>[] = []

  // Presence and field changes are emitted independently for each endpoint.
  for (const endpointId of [...endpointIds].toSorted()) {
    const beforeState = beforeById.get(endpointId)
    const afterState = afterById.get(endpointId)
    if (beforeState === undefined && afterState !== undefined) {
      endpointChanges.push({ kind: 'endpoint_added', ...endpointReference(afterState) })
      continue
    }
    if (beforeState !== undefined && afterState === undefined) {
      endpointChanges.push({ kind: 'endpoint_removed', ...endpointReference(beforeState) })
      continue
    }
    if (beforeState === undefined || afterState === undefined) {
      continue
    }

    const changedPaths = diffPricingStates(beforeState, afterState)
    if (changedPaths.length > 0) {
      endpointChanges.push({
        kind: 'pricing_changed',
        ...endpointReference(afterState),
        changed_paths: changedPaths,
      })
    }
  }

  return TransitionSchema.parse({
    from_crawl_id: before.crawl_id,
    to_crawl_id: after.crawl_id,
    endpoint_changes: endpointChanges,
  })
}

function diffPricingStates(before: EndpointPricingState, after: EndpointPricingState): string[] {
  const changedPaths: string[] = []

  // Compare every top-level pricing source independently.
  comparePath(changedPaths, 'pricing_version_id', before, after)
  comparePath(changedPaths, 'pricing_json', before, after)
  comparePath(changedPaths, 'display_pricing', before, after)
  comparePath(changedPaths, 'tiers', before, after)

  const pricingFields = new Set([...Object.keys(before.pricing), ...Object.keys(after.pricing)])
  for (const field of [...pricingFields].toSorted()) {
    if (!isDeepStrictEqual(before.pricing[field], after.pricing[field])) {
      changedPaths.push(`pricing.${field}`)
    }
  }

  return changedPaths.toSorted()
}

function comparePath(
  changes: string[],
  path: 'display_pricing' | 'pricing_json' | 'pricing_version_id' | 'tiers',
  before: EndpointPricingState,
  after: EndpointPricingState,
): void {
  if (!isDeepStrictEqual(before[path], after[path])) {
    changes.push(path)
  }
}

function endpointReference(state: EndpointPricingState) {
  return {
    endpoint_id: state.endpoint_id,
    model_id: state.model_id,
    provider_slug: state.provider_slug,
  }
}
