import type { Doc } from '../_generated/dataModel'
import { transformEndpointChange } from './endpointChange'

export type ChangeDoc = Doc<'or_views_changes'>

// * Transform changes based on entity type
export function transformChanges(changes: ChangeDoc[]): ChangeDoc[] {
  return changes.map((change) => {
    if (change.entity_type === 'endpoint' && change.change_kind === 'update') {
      return { ...change, ...transformEndpointChange(change) }
    }
    return change
  })
}
