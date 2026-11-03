/** Marks the part of the page where ↑, ↓, and Esc drive the Table's selection: `data-table-keys`. */
export const TABLE_KEYS_ATTRIBUTE = 'data-table-keys'

/** The focused element, as far as the rule needs to see it. */
export interface FocusProbe {
  /** The nearest ancestor-or-self matching a selector, as `Element.closest`. */
  closest: (selector: string) => object | null
}

/**
 * Whether the Table owns ↑, ↓, and Esc for the current focus. It does when nothing has focus (the
 * body) or focus is inside a region marked with `TABLE_KEYS_ATTRIBUTE`, such as the Results panel.
 * Anywhere else, whatever has focus keeps these keys: sliders, comboboxes, tabs, button groups, and
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

  return active.closest(`[${TABLE_KEYS_ATTRIBUTE}]`) !== null
}
