import type { PropertyState } from '#features/endpoints/search'

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
