import { createSlugSearcher } from '@orca/contract/slug-search'

import type { EndpointRow } from '#endpoints/snapshot'

export type OptionKind = 'model' | 'provider'

/** A model or provider a list facet can hold. */
export interface FacetOption {
  kind: OptionKind
  id: string
  name: string
  /** Listed endpoints, which ranks equally matching search results. */
  listed: number
}

export interface SnapshotOptions {
  model: FacetOption[]
  provider: FacetOption[]
}

/** Every model and provider on the rows, once each, in first-seen order. */
export function snapshotOptions(rows: readonly EndpointRow[]): SnapshotOptions {
  const model = new Map<string, FacetOption>()
  const provider = new Map<string, FacetOption>()

  for (const row of rows) {
    if (!model.has(row.model.id)) {
      model.set(row.model.id, {
        id: row.model.id,
        kind: 'model',
        listed: row.model.listed_endpoints,
        name: row.model.name,
      })
    }

    if (!provider.has(row.provider.id)) {
      provider.set(row.provider.id, {
        id: row.provider.id,
        kind: 'provider',
        listed: row.provider.listed_endpoints,
        name: row.provider.display_name,
      })
    }
  }

  return { model: [...model.values()], provider: [...provider.values()] }
}

/** A search over options by slug and display name, with more-listed options first among equals. */
export function createOptionSearch(options: readonly FacetOption[]) {
  const searcher = createSlugSearcher(options, {
    compareItems: (left, right) => right.listed - left.listed,
    getFields: ({ id, name }) => [
      { name: 'id', value: id },
      { name: 'name', value: name },
    ],
  })

  /** The matches in rank order. A blank query matches nothing. */
  return (query: string): FacetOption[] => {
    if (query.trim() === '') {
      return []
    }

    return searcher.search(query).map(({ record }) => record)
  }
}

/** The key by which options are told apart across kinds. */
export const optionKey = ({ id, kind }: Pick<FacetOption, 'id' | 'kind'>) => `${kind}:${id}`

/** A list facet's values in display order: the pinned ones, then the rest. */
export interface OrderedOptions {
  pinned: FacetOption[]
  rest: FacetOption[]
}

/**
 * The values a list facet lists. Pinned values come first and the rest follow, each group by count
 * descending, then by name. The caller chooses which values are pinned (see `pin-state.ts`); this
 * function only orders them.
 *
 * With `matches`, the facet is filtered: only those options are listed, and each group keeps the
 * search's relevance order instead, except that zero-count matches follow the others, so the first
 * row is never one that would add nothing while another could. Pinned values with no option, such
 * as stale URL values, are listed so they can be unchecked, but never match a filter.
 */
export function orderOptions(
  kind: OptionKind,
  options: readonly FacetOption[],
  counts: ReadonlyMap<string, number>,
  pinned: readonly string[],
  matches?: readonly FacetOption[],
): OrderedOptions {
  const isPinned = new Set(pinned)

  const positive = ({ id }: FacetOption) => (counts.get(id) ?? 0) > 0

  /** Keeps the order, but lists zero-count options after the others. */
  const demoteEmpty = (group: FacetOption[]) => [
    ...group.filter(positive),
    ...group.filter((option) => !positive(option)),
  ]

  let pool: readonly FacetOption[]

  if (matches === undefined) {
    const known = new Set(options.map(({ id }) => id))
    const stale = pinned.flatMap((id) => (known.has(id) ? [] : [staleOption(kind, id)]))

    pool = [...options, ...stale].toSorted(
      (left, right) =>
        (counts.get(right.id) ?? 0) - (counts.get(left.id) ?? 0) ||
        left.name.localeCompare(right.name) ||
        left.id.localeCompare(right.id),
    )
  } else {
    pool = matches
  }

  const pinnedGroup = pool.filter(({ id }) => isPinned.has(id))
  const restGroup = pool.filter(({ id }) => !isPinned.has(id))

  return matches === undefined
    ? { pinned: pinnedGroup, rest: restGroup }
    : { pinned: demoteEmpty(pinnedGroup), rest: demoteEmpty(restGroup) }
}

/** A value the catalogue lacks, listed under its id. */
const staleOption = (kind: OptionKind, id: string): FacetOption => ({
  id,
  kind,
  listed: 0,
  name: id,
})

/**
 * A list facet's header figure and its accessible name. With no selection it is the number of
 * values listed; with some, how many of them are selected.
 */
export function listMeta(
  selected: number,
  total: number,
  noun: { plural: string; singular: string },
): { label: string; text: string } {
  const word = total === 1 ? noun.singular : noun.plural

  return selected === 0
    ? { label: `${total} ${word}`, text: `${total}` }
    : { label: `${selected} of ${total} ${word} selected`, text: `${selected} of ${total}` }
}
