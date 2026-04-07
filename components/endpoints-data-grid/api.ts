import { convexQuery } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'
import ms from 'ms'
import { useMemo } from 'react'

import { api } from '@/convex/_generated/api'
import type { ORCAEndpoint } from '@/convex/db/or/views/endpoints'
import { attributes, isAttributeKey } from '@/lib/attributes'
import { createSlugSearcher } from '@/lib/slug-search'

import { useEndpointFilters } from './use-endpoint-filters'

export function useEndpointsData() {
  const { data: rawEndpoints, isPending } = useQuery(
    convexQuery(api.endpoints.list, { maxTimeUnavailable: ms('30d') }),
  )

  const { attributeFilters, globalFilter } = useEndpointFilters()
  const allEndpoints = useMemo(() => {
    const endpoints = rawEndpoints ?? []

    if (process.env.NODE_ENV === 'development') {
      return [FAKE_ENDPOINT, ...endpoints]
    }

    return endpoints
  }, [rawEndpoints])

  const attributeFilteredEndpoints = useMemo(() => {
    if (allEndpoints.length === 0) {
      return []
    }

    return allEndpoints.filter((endpoint) => {
      for (const [filterName, mode] of Object.entries(attributeFilters)) {
        if (!isAttributeKey(filterName)) {
          continue
        }

        let hasAttribute = false

        // Handle all attribute filters (including modalities which are now in attributes)
        hasAttribute = attributes[filterName].resolve(endpoint).active

        if (mode === 'include' && !hasAttribute) {
          return false
        }
        if (mode === 'exclude' && hasAttribute) {
          return false
        }
      }

      return true
    })
  }, [allEndpoints, attributeFilters])

  const endpointSearcher = useMemo(
    () =>
      createSlugSearcher(attributeFilteredEndpoints, {
        getFields: (endpoint) => [
          { name: 'model.slug', value: endpoint.model.slug },
          { name: 'model.version_slug', value: endpoint.model.version_slug },
          { name: 'provider.tag_slug', value: endpoint.provider.tag_slug },
        ],
        compareItems: (left, right) =>
          right.model.or_added_at - left.model.or_added_at ||
          left.model.slug.localeCompare(right.model.slug) ||
          left.provider.tag_slug.localeCompare(right.provider.tag_slug),
      }),
    [attributeFilteredEndpoints],
  )

  const filteredEndpoints = useMemo(() => {
    if (!globalFilter.trim()) {
      return attributeFilteredEndpoints
    }

    return endpointSearcher.search(globalFilter).map((result) => result.record)
  }, [attributeFilteredEndpoints, endpointSearcher, globalFilter])

  return {
    rawEndpoints: allEndpoints,
    filteredEndpoints,
    isLoading: isPending,
  }
}

const FAKE_ENDPOINT: ORCAEndpoint = {
  // oxlint-disable-next-line typescript-eslint/no-unsafe-assignment, typescript-eslint/no-unsafe-type-assertion -- Dev-only fake row needs a sentinel Convex id that never reaches the backend.
  _id: '__fake__' as any,
  _creationTime: Date.now(),
  uuid: 'fake-endpoint-uuid',
  model: {
    slug: 'orca/fake-model',
    base_slug: 'orca/fake-model',
    version_slug: 'orca/fake-model',
    variant: 'free',
    name: '🌺 ORCA Test Model',
    author_slug: 'orca',
    author_name: 'ORCA',
    or_added_at: Date.now(),
    input_modalities: ['text', 'image', 'file', 'audio'],
    output_modalities: ['text', 'image', 'audio', 'video'],
    reasoning: true,
  },
  provider: {
    slug: 'orca',
    tag_slug: 'orca',
    name: 'ORCA Test Provider',
    model_id: 'orca/fake-model',
  },
  data_policy: {
    may_train_on_data: true,
    may_publish_data: true,
    shares_user_id: true,
    may_retain_data: true,
    data_retention_days: 30,
  },
  pricing: {
    text_input: 0.000_001,
    text_output: 0.000_002,
    reasoning_output: 0.000_001_5,
    audio_input: 0.000_000_5,
    audio_cache_write: 0.000_000_25,
    text_cache_read: 0.000_000_1,
    text_cache_write: 0.000_000_5,
    image_input: 0.000_01,
    image_output: 0.000_02,
    web_search: 0.001,
    discount: 0.2,
  },
  variable_pricings: undefined,
  limits: {
    text_input_tokens: 200_000,
    image_input_tokens: 50_000,
    images_per_input: 20,
    requests_per_minute: 100,
    requests_per_day: 10_000,
  },
  context_length: 200_000,
  max_output: 16_000,
  quantization: 'fp16',
  supported_parameters: ['tools', 'response_format', 'structured_outputs'],
  completions: true,
  chat_completions: true,
  implicit_caching: true,
  native_web_search: true,
  moderated: true,
  deranked: true,
  disabled: false,
  updated_at: Date.now(),
}
