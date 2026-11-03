import type { Group } from '@orca/properties'

import type { PropertyFacetGroup } from '#endpoints/facets'
import type { PropertyState, ScopeFilters } from '#endpoints/scope'

const NEXT: Record<PropertyState, PropertyState> = {
  off: 'with',
  with: 'without',
  without: 'off',
}

/** A property facet's click cycle: off, then required, then excluded, then off again. */
export function nextPropertyState(state: PropertyState): PropertyState {
  return NEXT[state]
}

/** The state in words, for assistive technology. */
export const PROPERTY_STATE_WORDS: Record<PropertyState, string> = {
  off: 'not filtered',
  with: 'required',
  without: 'excluded',
}

/** Groups open until the user collapses them: the facets that decide most comparisons. */
const DEFAULT_OPEN_GROUPS: ReadonlySet<Group> = new Set([
  'data-policy',
  'tools',
  'output',
  'reasoning',
  'modality',
])

/** Properties in the group that the filters require or exclude. */
export function activeInGroup(
  group: PropertyFacetGroup,
  { with: required, without }: Pick<ScopeFilters, 'with' | 'without'>,
): number {
  return group.facets.filter(({ id }) => required.includes(id) || without.includes(id)).length
}

/** Whether a group shows its facets: a group with an active filter always does. */
export function isGroupOpen(
  group: PropertyFacetGroup,
  filters: Pick<ScopeFilters, 'with' | 'without'>,
  toggled: ReadonlyMap<Group, boolean>,
): boolean {
  return (
    activeInGroup(group, filters) > 0 ||
    (toggled.get(group.group) ?? DEFAULT_OPEN_GROUPS.has(group.group))
  )
}
