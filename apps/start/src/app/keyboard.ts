/*
 * The app's key-ownership and focus-return rules. Key ownership decides who keeps ↑, ↓, and Esc;
 * focus return keeps keyboard focus in the table when the Endpoint panel goes away.
 */

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

/** The Results region's element ID: where focus lands when its row is gone. */
export const RESULTS_REGION_ID = 'results-region'

/** An element that can take focus, as far as returning focus needs to see it. */
interface Focusable {
  focus: () => void
}

/**
 * Moves keyboard focus back to an endpoint's row, as when its panel closes and takes the focused
 * element with it. The row is found by its ID attribute, the same one the Table keeps its selection
 * by. If the filters have dropped the row, focus goes to the Results region instead, so the next
 * Tab continues from the table rather than from the top of the page. Returns what took focus.
 */
export function returnFocusToTable(
  endpointId: string,
  query: (selector: string) => Focusable | null,
): 'region' | 'row' | null {
  const row = query(`tr[data-endpoint-id="${CSS.escape(endpointId)}"]`)

  if (row !== null) {
    row.focus()

    return 'row'
  }

  const region = query(`#${RESULTS_REGION_ID}`)

  if (region === null) {
    return null
  }

  region.focus()

  return 'region'
}

/** A container that can say whether a node sits inside it, as far as the panel's focus check sees. */
interface Container<Candidate> {
  contains: (candidate: Candidate | null) => boolean
}

/**
 * Hands focus back to the table when the Endpoint panel goes away holding it. Whatever cleared the
 * selection (the close button, Esc, history navigation) leaves the focused element to be unmounted
 * with the panel, and focus would fall to the page. Focus already outside the panel stays where it
 * is, as does focus that has already left it. Returns what took focus, or null if nothing moved.
 */
export function returnFocusFromPanel<Candidate>(
  panel: Container<Candidate>,
  active: Candidate | null,
  endpointId: string,
  query: (selector: string) => Focusable | null,
): 'region' | 'row' | null {
  if (active === null || !panel.contains(active)) {
    return null
  }

  return returnFocusToTable(endpointId, query)
}
