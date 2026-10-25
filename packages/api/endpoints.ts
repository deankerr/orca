import type { Endpoint } from '@orca/contract/endpoint'
import { createSlugSearcher } from '@orca/contract/slug-search'
import { z } from 'zod'

import { compareBy, matchesStatus, Order, sortKeys, Status } from './select'

const maxRate = z.coerce.number().nonnegative().optional()

const endpointSorts = {
  context_length: (endpoint: Endpoint) => endpoint.context_length,
  created: (endpoint: Endpoint) => Date.parse(endpoint.model.created_at),
  input_price: (endpoint: Endpoint) => rate(endpoint.pricing.input),
  latency: (endpoint: Endpoint) => endpoint.stats.p50_latency_ms,
  output_price: (endpoint: Endpoint) => rate(endpoint.pricing.output),
  throughput: (endpoint: Endpoint) => endpoint.stats.p50_throughput_tps,
} satisfies Record<string, (endpoint: Endpoint) => number | null>

export const EndpointSelection = z.object({
  max_input_price: maxRate.meta({ description: 'Maximum text input rate per token.' }),
  max_output_price: maxRate.meta({ description: 'Maximum text output rate per token.' }),
  min_context_length: z.coerce.number().int().nonnegative().optional().meta({
    description: 'Minimum context length in tokens.',
  }),
  order: Order,
  provider: z
    .string()
    .min(1)
    .optional()
    .meta({ description: 'Provider slug.', example: 'deepinfra' }),
  q: z
    .string()
    .optional()
    .meta({
      description:
        'Slug search over model slugs and provider tags. Every whitespace-separated token must match a ' +
        'slug, slug segment, or boundary suffix by prefix. Results rank by match quality unless `sort` is set.',
      example: 'qwen deepinfra',
    }),
  sort: z.enum(sortKeys(endpointSorts)).optional().meta({
    description: 'Sort key; model creation time by default.',
  }),
  status: Status('endpoints', 'are included for 30 days after unlisting.'),
})

export type EndpointSelection = z.infer<typeof EndpointSelection>

/** A model or provider path parameter that fixes one side of the selection. */
export interface EndpointScope {
  modelId?: string
  providerId?: string
}

function rate(value: string | null) {
  return value === null ? null : Number(value)
}

function atMost(value: number | null, bound: number | undefined) {
  return bound === undefined || (value !== null && value <= bound)
}

function matches(endpoint: Endpoint, selection: EndpointSelection, scope: EndpointScope) {
  const providerId = scope.providerId ?? selection.provider
  return (
    matchesStatus(endpoint.unlisted_at === null, selection.status) &&
    (scope.modelId === undefined || endpoint.model.id === scope.modelId) &&
    (providerId === undefined || endpoint.provider.id === providerId) &&
    (selection.min_context_length === undefined ||
      (endpoint.context_length ?? 0) >= selection.min_context_length) &&
    atMost(rate(endpoint.pricing.input), selection.max_input_price) &&
    atMost(rate(endpoint.pricing.output), selection.max_output_price)
  )
}

/** The grid's default order: newest models first, then model slug and provider tag. */
function compareDefault(left: Endpoint, right: Endpoint) {
  return (
    right.model.created_at.localeCompare(left.model.created_at) ||
    left.model.id.localeCompare(right.model.id) ||
    left.provider.tag.localeCompare(right.provider.tag)
  )
}

/** Filter, search, and order endpoints within an optional model or provider scope. */
export function selectEndpoints(
  endpoints: readonly Endpoint[],
  selection: EndpointSelection,
  scope: EndpointScope = {},
) {
  const selected = endpoints.filter((endpoint) => matches(endpoint, selection, scope))
  const query = selection.q?.trim() ?? ''

  const ranked =
    query === ''
      ? selected.toSorted(compareDefault)
      : createSlugSearcher(selected, {
          compareItems: compareDefault,
          getFields: (endpoint) => [
            { name: 'model_id', value: endpoint.model.id },
            { name: 'provider_tag', value: endpoint.provider.tag },
          ],
        })
          .search(query)
          .map((result) => result.record)

  return selection.sort === undefined
    ? ranked
    : ranked.toSorted(compareBy(endpointSorts[selection.sort], selection.order))
}
