import type { Model } from '@orca/contract/model'
import { createSlugSearcher } from '@orca/contract/slug-search'
import { z } from 'zod'

import { compareBy, HasListings, matchesListings, Order, sortKeys } from './select'

const modelSorts = {
  created: (model: Model) => Date.parse(model.created_at),
  endpoints: (model: Model) => model.listed_endpoints,
  providers: (model: Model) => model.provider_ids.length,
} satisfies Record<string, (model: Model) => number | null>

export const ModelSelection = z.object({
  author: z.string().min(1).optional().meta({ description: 'Author slug.', example: 'moonshotai' }),
  has_listings: HasListings('models'),
  order: Order,
  provider: z.string().min(1).optional().meta({
    description: 'Provider slug with a listed endpoint for the model.',
    example: 'deepinfra',
  }),
  q: z
    .string()
    .optional()
    .meta({
      description:
        'Slug search over model slugs, by the same rules as endpoint search. ' +
        'Results rank by match quality unless `sort` is set.',
      example: 'kimi',
    }),
  sort: z.enum(sortKeys(modelSorts)).optional().meta({
    description: 'Sort key; creation time by default.',
  }),
})

export type ModelSelection = z.infer<typeof ModelSelection>

function matches(model: Model, selection: ModelSelection) {
  return (
    matchesListings(model.listed_endpoints, selection.has_listings) &&
    (selection.author === undefined || model.author.id === selection.author) &&
    (selection.provider === undefined || model.provider_ids.includes(selection.provider))
  )
}

/** Newest models first, then slug. */
function compareDefault(left: Model, right: Model) {
  return right.created_at.localeCompare(left.created_at) || left.id.localeCompare(right.id)
}

export function selectModels(models: readonly Model[], selection: ModelSelection) {
  const selected = models.filter((model) => matches(model, selection))
  const query = selection.q?.trim() ?? ''

  const ranked =
    query === ''
      ? selected.toSorted(compareDefault)
      : createSlugSearcher(selected, {
          compareItems: compareDefault,
          getFields: (model) => [{ name: 'model_id', value: model.id }],
        })
          .search(query)
          .map((result) => result.record)

  return selection.sort === undefined
    ? ranked
    : ranked.toSorted(compareBy(modelSorts[selection.sort], selection.order))
}
