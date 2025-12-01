import type { Doc } from '../_generated/dataModel'
import { transformEndpointChange } from './endpointChange'

// * Transform changes based on entity type
export function transformChanges(changes: Doc<'or_views_changes'>[]) {
  return changes.map((change) => {
    if (change.entity_type === 'endpoint' && change.change_kind === 'update') {
      return { ...change, ...transformEndpointChange(change) }
    }
    return change
  })
}
