import { createSlugSearcher } from '@orca/contract/slug-search'

import type { EndpointRow } from '#features/endpoints/rows'

export type OptionKind = 'model' | 'provider'

/** A model or provider a list facet can hold. */
export interface FacetOption {
  kind: OptionKind
  id: string
  name: string
  /** Listed endpoints, which ranks equally matching search results. */
  listed: number
}

export interface CatalogOptions {
  model: FacetOption[]
  provider: FacetOption[]
}

/** Every model and provider on the rows, once each, in first-seen order. */
export function catalogOptions(rows: readonly EndpointRow[]): CatalogOptions {
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

  return (
    query: string,
    limit: number,
    exclude: ReadonlySet<string> = new Set(),
  ): FacetOption[] => {
    if (query.trim() === '') {
      return []
    }

    return searcher
      .search(query)
      .map(({ record }) => record)
      .filter(({ id, kind }) => !exclude.has(`${kind}:${id}`))
      .slice(0, limit)
  }
}

/** The key by which options are told apart across kinds. */
export const optionKey = ({ id, kind }: Pick<FacetOption, 'id' | 'kind'>) => `${kind}:${id}`

/**
 * The options a list facet shows: selected values first, in selection order, then the highest counts.
 * Equal counts keep the catalogue's order. Selected values with no option, such as stale URL values,
 * are kept so they can be unchecked.
 */
export function visibleOptions(
  kind: OptionKind,
  options: readonly FacetOption[],
  counts: ReadonlyMap<string, number>,
  selected: readonly string[],
  top: number,
): FacetOption[] {
  const byId = new Map(options.map((option) => [option.id, option]))
  const chosen = selected.map((id) => byId.get(id) ?? { id, kind, listed: 0, name: id })
  const picked = new Set(selected)

  const leading = options
    .flatMap((option, position) => (picked.has(option.id) ? [] : [{ option, position }]))
    .toSorted(
      (left, right) =>
        (counts.get(right.option.id) ?? 0) - (counts.get(left.option.id) ?? 0) ||
        left.position - right.position,
    )
    .slice(0, top)
    .map(({ option }) => option)

  return [...chosen, ...leading]
}
