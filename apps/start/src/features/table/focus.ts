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
