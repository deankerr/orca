export type Step = 'next' | 'previous'

/**
 * The row ID one step from the selected row, stopping at either end. With nothing selected, or a
 * selection outside the list, either step starts at the first row. Null when there are no rows.
 */
export function steppedRowId(
  ids: readonly string[],
  selected: string | undefined,
  step: Step,
): string | null {
  const index = selected === undefined ? -1 : ids.indexOf(selected)

  if (index === -1) {
    return ids[0] ?? null
  }

  const target = step === 'next' ? Math.min(index + 1, ids.length - 1) : Math.max(index - 1, 0)

  return ids[target] ?? null
}
