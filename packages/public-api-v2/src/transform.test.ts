import { describe, expect, test } from 'bun:test'

import { ModelEndpoints } from '@orca/inventory'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

import { projectModelEndpoints } from './transform.ts'

const decodeModelEndpoints = Schema.decodeUnknownSync(ModelEndpoints)

const normalizedModelEndpoints = decodeModelEndpoints({
  endpoints: [
    {
      context_length: 128_000,
      data_policy: {
        canPublish: false,
        requiresUserIDs: false,
        retainsPrompts: true,
        retentionDays: 30,
        training: false,
      },
      features: {
        supports_implicit_caching: true,
        supports_native_web_search: false,
      },
      has_chat_completions: true,
      has_completions: false,
      id: 'nvidia/nemotron:openai',
      is_deranked: false,
      is_disabled: false,
      limit_rpd: null,
      limit_rpm: 500,
      max_completion_tokens: 16_384,
      max_prompt_images: null,
      max_prompt_tokens: 128_000,
      max_tokens_per_image: null,
      model_variant_permaslug: 'nvidia/nemotron-nano-12b-v2-vl',
      model_variant_slug: 'nvidia/nemotron-nano-12b-v2-vl',
      moderation_required: false,
      pricing: {
        audio: '0',
        completion: '0.00001',
        image: '0',
        image_output: '0',
        input_audio_cache: '0',
        input_cache_read: '0.00000125',
        input_cache_write: '0',
        internal_reasoning: '0',
        prompt: '0.0000025',
        request: '0',
      },
      provider_display_name: 'OpenAI',
      provider_model_id: 'nemotron',
      provider_name: 'openai',
      provider_region: null,
      provider_slug: 'openai',
      quantization: 'fp8',
      stats: {
        p50_latency: 420,
        p50_throughput: 80.5,
      },
      supported_parameters: ['temperature', 'max_tokens'],
      variant: 'standard',
    },
  ],
  model: {
    author: 'nvidia',
    author_display_name: 'Nvidia',
    created_at: '2025-10-28T18:19:25.723503+00:00',
    input_modalities: ['video', 'text', 'image'],
    name: 'NVIDIA: Nemotron Nano 12B 2 VL',
    output_modalities: ['text'],
    permaslug: 'nvidia/nemotron-nano-12b-v2-vl',
    short_name: 'Nemotron Nano 12B 2 VL',
    slug: 'nvidia/nemotron-nano-12b-v2-vl',
    supports_reasoning: true,
    variant: 'standard',
  },
})

describe('projectModelEndpoints', () => {
  test('maps one normalized ModelEndpoints to the V2 response', () => {
    const projectedModel = projectModelEndpoints(normalizedModelEndpoints)
    expect(Option.isSome(projectedModel)).toBe(true)
    if (Option.isNone(projectedModel)) {
      return
    }

    const { providers, ...model } = projectedModel.value
    expect(model).toEqual({
      author_name: 'NVIDIA',
      created_at: '2025-10-28T18:19:25.723Z',
      id: 'nvidia/nemotron-nano-12b-v2-vl',
      input_modalities: ['image', 'text', 'video'],
      name: 'Nemotron Nano 12B 2 VL',
      output_modalities: ['text'],
      reasoning: true,
      variant: 'standard',
      version_id: 'nvidia/nemotron-nano-12b-v2-vl',
    })

    const [provider] = providers
    expect(provider?.context_length).toBe(128_000)
    expect(provider?.provider_id).toBe('openai')
    expect(provider?.provider_name).toBe('OpenAI')
    expect(provider?.quantization).toBe('fp8')
    expect(provider?.supported_parameters).toEqual(['max_tokens', 'temperature'])
    expect(provider?.pricing).toMatchObject({
      per_request: null,
      text_cache_read: '0.00000125',
      text_input: '0.0000025',
      text_output: '0.00001',
      tiers: null,
    })
  })

  test('omits disabled endpoints and a model with no remaining providers', () => {
    const disabled = {
      ...normalizedModelEndpoints,
      endpoints: normalizedModelEndpoints.endpoints.map((endpoint) => ({
        ...endpoint,
        is_disabled: true,
      })),
    }

    expect(Option.isNone(projectModelEndpoints(disabled))).toBe(true)
  })

  test('keeps enabled providers while omitting disabled siblings', () => {
    const [openAiEndpoint] = normalizedModelEndpoints.endpoints
    if (openAiEndpoint === undefined) {
      throw new Error('expected the fixture to contain an endpoint')
    }

    const multipleProviders = decodeModelEndpoints({
      ...normalizedModelEndpoints,
      endpoints: [
        openAiEndpoint,
        {
          ...openAiEndpoint,
          is_disabled: true,
          provider_display_name: 'Disabled Co',
          provider_slug: 'disabled',
        },
        {
          ...openAiEndpoint,
          provider_display_name: 'Together',
          provider_slug: 'together',
        },
      ],
    })

    const projectedModel = projectModelEndpoints(multipleProviders)
    expect(Option.isSome(projectedModel)).toBe(true)
    if (Option.isSome(projectedModel)) {
      expect(projectedModel.value.providers.map((provider) => provider.provider_id)).toEqual([
        'openai',
        'together',
      ])
    }
  })

  test('defaults optional provider details without inventing telemetry', () => {
    const [endpoint] = normalizedModelEndpoints.endpoints
    if (endpoint === undefined) {
      throw new Error('expected the fixture to contain an endpoint')
    }
    const { quantization: _quantization, stats: _stats, ...sparseEndpoint } = endpoint

    const sparseProvider = decodeModelEndpoints({
      ...normalizedModelEndpoints,
      endpoints: [
        {
          ...sparseEndpoint,
          data_policy: {},
          features: {},
        },
      ],
    })

    const projectedModel = projectModelEndpoints(sparseProvider)
    expect(Option.isSome(projectedModel)).toBe(true)
    if (Option.isSome(projectedModel)) {
      const [provider] = projectedModel.value.providers
      expect(provider?.data_policy).toEqual({
        data_retention_days: null,
        may_publish_data: false,
        may_retain_data: false,
        may_train_on_data: false,
        shares_user_id: false,
      })
      expect(provider?.implicit_caching).toBe(false)
      expect(provider?.native_web_search).toBe(false)
      expect(provider?.quantization).toBe('unknown')
      expect(provider?.stats_last_30m).toBeNull()
    }
  })

  test('soft-skips a normalized model that lacks fields required by V2', () => {
    const missingCreationTime = decodeModelEndpoints({
      ...normalizedModelEndpoints,
      model: { ...normalizedModelEndpoints.model, created_at: null },
    })

    expect(Option.isNone(projectModelEndpoints(missingCreationTime))).toBe(true)
  })
})
