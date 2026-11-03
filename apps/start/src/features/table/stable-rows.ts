import { useState } from 'react'

/** Whether two lists hold the same items in the same order. */
export function sameItems<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index])
}

/**
 * The latest list, keeping the previous array while its items are unchanged. The filtered rows come
 * back as a new array whenever any search param changes, selection included; keeping the old one
 * saves the table from rebuilding and re-rendering every row when only the selection moved.
 */
export function useStableList<T>(list: readonly T[]): readonly T[] {
  const [stable, setStable] = useState(list)

  if (sameItems(stable, list)) {
    return stable
  }

  setStable(list)

  return list
}
