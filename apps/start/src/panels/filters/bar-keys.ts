/**
 * The keys of a histogram row. The bars are one tab stop; arrows and Home and End move a preview
 * across them without changing the bound, Enter and Space press the bar under the preview, and Esc
 * drops the preview or, with none, clears the bound. Pressing is the only change, so each one is one
 * history entry.
 */
export type BarKeyAction =
  /** Preview the bar at `index` and move focus to it. */
  | { kind: 'preview'; index: number }
  /** Press the bar at `index`, as a click would. */
  | { kind: 'press'; index: number }
  /** Drop the preview, keyboard and pointer alike. */
  | { kind: 'cancel' }
  /** Clear the bound. */
  | { kind: 'clear' }

export interface BarKeyState {
  /** The bar the keyboard previews, which has focus; undefined when it previews none. */
  cursor: number | undefined
  /** The bar the pointer previews; undefined when it previews none. */
  hovered: number | undefined
  /** The bar that holds the tab stop, and has focus while the keyboard previews none. */
  home: number
  /** How many bars there are. */
  count: number
  /** Whether the row has a bound. */
  bounded: boolean
}

/** The action a key takes, or undefined when the row leaves the key to the page. */
export function barKeyAction(
  key: string,
  { bounded, count, cursor, home, hovered }: BarKeyState,
): BarKeyAction | undefined {
  const focused = cursor ?? home

  const preview = (index: number): BarKeyAction => ({
    index: Math.min(Math.max(index, 0), count - 1),
    kind: 'preview',
  })

  switch (key) {
    case 'ArrowLeft':
    case 'ArrowDown': {
      return preview(focused - 1)
    }

    case 'ArrowRight':
    case 'ArrowUp': {
      return preview(focused + 1)
    }

    case 'Home': {
      return preview(0)
    }

    case 'End': {
      return preview(count - 1)
    }

    case 'Enter':
    case ' ': {
      return { index: focused, kind: 'press' }
    }

    case 'Escape': {
      // Either preview, keyboard or pointer, is dropped before the bound is cleared.
      if (cursor !== undefined || hovered !== undefined) {
        return { kind: 'cancel' }
      }

      return bounded ? { kind: 'clear' } : undefined
    }

    default: {
      return undefined
    }
  }
}
