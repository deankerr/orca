/** What a key does in a list facet's filter field. */
export type FilterKeyAction = 'clear' | 'toggle-first'

/**
 * The action for a key pressed in the filter field, or undefined to leave it alone. Esc clears a
 * filled field and Enter toggles the first match of a non-blank filter; an empty field leaves both
 * keys to the rest of the app. Keys pressed while an input method is composing text belong to it.
 */
export function filterKeyAction(
  event: { isComposing: boolean; key: string },
  query: string,
): FilterKeyAction | undefined {
  if (event.isComposing) {
    return undefined
  }

  if (event.key === 'Escape' && query !== '') {
    return 'clear'
  }

  if (event.key === 'Enter' && query.trim() !== '') {
    return 'toggle-first'
  }

  return undefined
}
