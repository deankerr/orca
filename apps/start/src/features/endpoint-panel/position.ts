/** Shown instead of a position when the filters exclude the selected endpoint. */
export const NOT_IN_FILTERS = 'NOT IN CURRENT FILTERS'

/** The selected endpoint's 1-based place in the filtered, sorted rows: `ENDPOINT 11 OF 103`. */
export function positionText(rows: readonly { id: string }[], selectedId: string): string {
  const index = rows.findIndex(({ id }) => id === selectedId)

  return index === -1 ? NOT_IN_FILTERS : `ENDPOINT ${index + 1} OF ${rows.length}`
}
