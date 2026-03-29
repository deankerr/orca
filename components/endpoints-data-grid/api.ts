import { useMemo } from 'react'

import { convexQuery } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'
import ms from 'ms'

import { api } from '@/convex/_generated/api'
import type { ORCAEndpoint } from '@/convex/db/or/views/endpoints'

import { attributes, isAttributeKey } from '@/lib/attributes'

import { useEndpointFilters } from './use-endpoint-filters'

export function useEndpointsData() {
  const { data: rawEndpoints, isPending } = useQuery(
    convexQuery(api.endpoints.list, { maxTimeUnavailable: ms('30d') }),
  )

  const { attributeFilters } = useEndpointFilters()

  const filteredEndpoints = useMemo(() => {
    if (!rawEndpoints) return []

    const filtered = rawEndpoints.filter((endpoint) => {
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

    // Inject fake endpoint in development
    if (process.env.NODE_ENV === 'development') {
      return [FAKE_ENDPOINT, ...filtered]
    }

    return filtered
  }, [rawEndpoints, attributeFilters])

  return {
    rawEndpoints: rawEndpoints ?? [],
    filteredEndpoints,
    isLoading: isPending,
  }
}

const FAKE_ENDPOINT: ORCAEndpoint = {
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
    output_modalities: ['text', 'image'],
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
    text_input: 0.000001,
    text_output: 0.000002,
    reasoning_output: 0.0000015,
    audio_input: 0.0000005,
    audio_cache_write: 0.00000025,
    text_cache_read: 0.0000001,
    text_cache_write: 0.0000005,
    image_input: 0.00001,
    image_output: 0.00002,
    web_search: 0.001,
    discount: 0.2,
  },
  variable_pricings: undefined,
  limits: {
    text_input_tokens: 200000,
    image_input_tokens: 50000,
    images_per_input: 20,
    requests_per_minute: 100,
    requests_per_day: 10000,
  },
  context_length: 200000,
  max_output: 16000,
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
