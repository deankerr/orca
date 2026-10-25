import type { Provider } from '@orca/contract/provider'
import { createSlugSearcher } from '@orca/contract/slug-search'
import { z } from 'zod'

import { compareBy, HasListings, matchesListings, Order, sortKeys } from './select'

const providerSorts = {
  endpoints: (provider: Provider) => provider.listed_endpoints,
  models: (provider: Provider) => provider.listed_models,
} satisfies Record<string, (provider: Provider) => number | null>

export const ProviderSelection = z.object({
  has_listings: HasListings('providers'),
  order: Order,
  q: z
    .string()
    .optional()
    .meta({
      description:
        'Search over provider slugs and names, by the same rules as endpoint search. ' +
        'Results rank by match quality unless `sort` is set.',
      example: 'deepinfra',
    }),
  sort: z.enum(sortKeys(providerSorts)).optional().meta({
    description: 'Sort key; name by default.',
  }),
})

export type ProviderSelection = z.infer<typeof ProviderSelection>

/** Alphabetical by name, then slug. */
function compareDefault(left: Provider, right: Provider) {
  return left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
}

export function selectProviders(providers: readonly Provider[], selection: ProviderSelection) {
  const selected = providers.filter((provider) =>
    matchesListings(provider.listed_endpoints, selection.has_listings),
  )

  const query = selection.q?.trim() ?? ''

  const ranked =
    query === ''
      ? selected.toSorted(compareDefault)
      : createSlugSearcher(selected, {
          compareItems: compareDefault,
          getFields: (provider) => [
            { name: 'provider_id', value: provider.id },
            { name: 'name', value: provider.name },
          ],
        })
          .search(query)
          .map((result) => result.record)

  return selection.sort === undefined
    ? ranked
    : ranked.toSorted(compareBy(providerSorts[selection.sort], selection.order))
}
