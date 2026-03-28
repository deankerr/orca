import type { Doc } from '../_generated/dataModel'
import { transformEndpointChangeV2 } from './endpointChange'

// * Transform changes based on entity type
export function transformChangesV2(changes: Doc<'or_views_changes'>[]) {
  return changes.map((change) => {
    if (change.entity_type === 'endpoint' && change.change_kind === 'update') {
      return { ...change, ...transformEndpointChangeV2(change) }
    }
    return change
  })
}

export type TransformedChangeV2 = ReturnType<typeof transformChangesV2>[number]
