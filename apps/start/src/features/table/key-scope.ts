/** Marks the part of the page where ↑, ↓, and Esc drive the Table's selection: `data-table-keys`. */
export const TABLE_KEYS_ATTRIBUTE = 'data-table-keys'

/**
 * Marks a widget inside such a region that keeps ↑, ↓, and Esc for itself even though it is not a
 * text field or ARIA widget the hotkey registrations would skip: `data-keys-reserved`. The theme
 * menu's trigger sits in the Results panel's status bar and opens its menu with the arrow keys.
 */
export const KEYS_RESERVED_ATTRIBUTE = 'data-keys-reserved'

/** The focused element, as far as the rule needs to see it. */
export interface FocusProbe {
  /** The nearest ancestor-or-self matching a selector, as `Element.closest`. */
  closest: (selector: string) => object | null
}

/**
 * Whether the Table owns ↑, ↓, and Esc for the current focus. It does when nothing has focus (the
 * body) or focus is inside a region marked with `TABLE_KEYS_ATTRIBUTE`, such as the Results panel,
 * unless the focused widget is marked `KEYS_RESERVED_ATTRIBUTE`. Anywhere else, whatever has focus keeps these keys: sliders, comboboxes, tabs, button groups, and
 * widgets not built yet.
 *
 * This is an allowlist because the alternative is guessing which widgets use arrows and Esc, and a
 * guess that misses one steals its keys. A region left out only costs the shortcut there.
 *
 * Inside the region, widgets that claim a key still keep it: the hotkey registrations skip text
 * fields and ARIA widgets (`ignoreInputs`) before this rule is asked.
 */
export function tableOwnsKeys(active: FocusProbe | null, body: FocusProbe): boolean {
  if (active === null || active === body) {
    return true
  }

  if (active.closest(`[${KEYS_RESERVED_ATTRIBUTE}]`) !== null) {
    return false
  }

  return active.closest(`[${TABLE_KEYS_ATTRIBUTE}]`) !== null
}

/** The key event, as far as the Endpoint panel's Esc rule needs to see it. */
export interface EscapeEvent {
  isComposing: boolean
  key: string
}

/**
 * Whether Esc closes the Endpoint panel, for a key pressed anywhere inside it: its tabs, header,
 * and bodies alike. The panel handles this itself instead of through `tableOwnsKeys`, whose
 * allowlist and `ignoreInputs` skip the tab list on purpose, because tabs use the arrow keys. Esc
 * is not one of them, so the panel claims it everywhere, even with a description tooltip open, which
 * has already used the key to close itself. An input method composing text keeps its Esc.
 */
export function panelClosesOnEscape(event: EscapeEvent): boolean {
  return event.key === 'Escape' && !event.isComposing
}
