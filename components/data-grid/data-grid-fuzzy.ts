import type { RankingInfo } from '@tanstack/match-sorter-utils'
import { compareItems, rankings, rankItem } from '@tanstack/match-sorter-utils'
import type { FilterFn, SortingFn } from '@tanstack/react-table'
import { sortingFns } from '@tanstack/react-table'

declare module '@tanstack/react-table' {
  //add fuzzy filter to the filterFns
  interface FilterFns {
    fuzzy?: FilterFn<unknown>
  }
  interface FilterMeta {
    itemRank: RankingInfo
  }
}

export const fuzzyFilter: FilterFn<any> = (row, columnId, value, addMeta) => {
  // Rank the item
  const itemRank = rankItem(row.getValue(columnId), value, {
    threshold: rankings.WORD_STARTS_WITH,
  })

  // Store the itemRank info
  addMeta({ itemRank })

  // Return if the item should be filtered in/out
  return itemRank.passed
}

export const fuzzySort: SortingFn<any> = (rowA, rowB, columnId) => {
  let dir = 0

  // Only sort by rank if the column has ranking information
  const rankA = rowA.columnFiltersMeta[columnId]?.itemRank
  const rankB = rowB.columnFiltersMeta[columnId]?.itemRank
  if (rankA && rankB) {
    dir = compareItems(rankA, rankB)
  }

  // Provide an alphanumeric fallback for when the item ranks are equal
  return dir === 0 ? sortingFns.alphanumeric(rowA, rowB, columnId) : dir
}
