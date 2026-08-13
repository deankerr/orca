import { describe, expect, test } from 'bun:test'

import { toModelEndpoints } from '@orca/entities/model-endpoints.ts'
import * as Option from 'effect/Option'

import { decodeEndpointOption, decodeModelOption } from './schema.ts'
import type { EndpointObservation } from './schema.ts'
import { toModel, toProvider } from './transform.ts'

/** Embedded model as it appears on raw OR endpoint rows (no variant). */
const embeddedModel = {
  author: 'nvidia',
  author_display_name: 'Nvidia',
  created_at: '2025-10-28T18:19:25.723503+00:00',
  input_modalities: ['image', 'text', 'video'],
  name: 'NVIDIA: Nemotron Nano 12B 2 VL',
  output_modalities: ['text'],
  permaslug: 'nvidia/nemotron-nano-12b-v2-vl',
  short_name: 'Nemotron Nano 12B 2 VL',
  slug: 'nvidia/nemotron-nano-12b-v2-vl',
  supports_reasoning: true,
}

/** Minimal raw endpoint row (pre-prep). Includes identity fields prep requires. */
const rawEndpoint = {
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
  is_deranked: false,
  is_disabled: false,
  limit_rpd: null,
  limit_rpm: 500,
  max_completion_tokens: 16_384,
  max_prompt_images: null,
  max_prompt_tokens: 128_000,
  max_tokens_per_image: null,
  model: embeddedModel,
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
  provider_region: null,
  provider_slug: 'openai',
  quantization: 'fp8',
  stats: {
    p50_latency: 420,
    p50_throughput: 80.5,
  },
  supported_parameters: ['temperature', 'max_tokens'],
  variant: 'standard',
}

/** Same steps as `receive` after envelope decode. */
function mapScope(data: ReadonlyArray<unknown>) {
  let prepared: ReturnType<typeof toModelEndpoints>
  try {
    prepared = toModelEndpoints(data)
  } catch {
    return null
  }

  const modelObs = decodeModelOption(prepared.model)
  if (Option.isNone(modelObs)) {
    return null
  }

  const providers = []
  for (const row of prepared.endpoints) {
    const endpoint = decodeEndpointOption(row)
    if (Option.isNone(endpoint) || endpoint.value.is_disabled) {
      continue
    }
    providers.push(toProvider(endpoint.value))
  }

  if (providers.length === 0) {
    return null
  }

  return toModel(modelObs.value, providers)
}

function requireEndpoint(input: unknown): EndpointObservation {
  const decoded = decodeEndpointOption(input)
  if (Option.isNone(decoded)) {
    throw new Error('expected endpoint revalidation to succeed')
  }
  return decoded.value
}

describe('toProvider', () => {
  test('maps post-prep endpoint row to V2 provider', () => {
    const prepared = toModelEndpoints([rawEndpoint])
    const provider = toProvider(requireEndpoint(prepared.endpoints[0]))

    expect(provider.provider_id).toBe('openai')
    expect(provider.provider_name).toBe('OpenAI')
    expect(provider.provider_region).toBeNull()
    expect(provider.context_length).toBe(128_000)
    expect(provider.pricing.text_input).toBe('0.0000025')
    expect(provider.pricing.text_output).toBe('0.00001')
    expect(provider.pricing.text_cache_read).toBe('0.00000125')
    expect(provider.pricing.per_request).toBeNull()
    expect(provider.pricing.tiers).toBeNull()
    expect(provider.quantization).toBe('fp8')
    expect(provider.data_policy).toEqual({
      data_retention_days: 30,
      may_publish_data: false,
      may_retain_data: true,
      may_train_on_data: false,
      shares_user_id: false,
    })
    expect(provider.limits).toEqual({
      image_input_tokens: null,
      images_per_input: null,
      requests_per_day: null,
      requests_per_minute: 500,
      text_input_tokens: 128_000,
      text_output_tokens: 16_384,
    })
    expect(provider.completions).toBe(false)
    expect(provider.chat_completions).toBe(true)
    expect(provider.implicit_caching).toBe(true)
    expect(provider.native_web_search).toBe(false)
    expect(provider.stats_last_30m).toEqual({
      latency_ms_p50: 420,
      tokens_per_sec_p50: 80.5,
    })
  })

  test('decodeEndpointOption is None on bad input', () => {
    expect(Option.isNone(decodeEndpointOption({}))).toBe(true)
  })

  test('defaults missing sparse policy / feature flags', () => {
    const prepared = toModelEndpoints([rawEndpoint])
    const base = requireEndpoint(prepared.endpoints[0])
    const { stats: _stats, ...withoutStats } = base
    const provider = toProvider({
      ...withoutStats,
      data_policy: {},
      features: {},
      quantization: null,
    })

    expect(provider.quantization).toBe('unknown')
    expect(provider.data_policy.may_train_on_data).toBe(false)
    expect(provider.implicit_caching).toBe(false)
    expect(provider.stats_last_30m).toBeNull()
  })

  test('endpoint revalidation does not require nested model', () => {
    const prepared = toModelEndpoints([rawEndpoint])
    expect(Option.isSome(decodeEndpointOption(prepared.endpoints[0]))).toBe(true)
  })
})

describe('toModel', () => {
  test('builds full model with providers key in alphabetical place', () => {
    const modelObs = decodeModelOption({
      author: 'nvidia',
      created_at: '2025-10-28T18:19:25.723503+00:00',
      input_modalities: ['image', 'text', 'video'],
      name: 'NVIDIA: Nemotron Nano 12B 2 VL (free)',
      output_modalities: ['text'],
      permaslug: 'nvidia/nemotron-nano-12b-v2-vl:free',
      short_name: 'Nemotron Nano 12B 2 VL (free)',
      slug: 'nvidia/nemotron-nano-12b-v2-vl:free',
      supports_reasoning: true,
      variant: 'free',
    })
    expect(Option.isSome(modelObs)).toBe(true)
    if (Option.isNone(modelObs)) {
      return
    }

    const model = toModel(modelObs.value, [])

    expect(Object.keys(model)).toEqual([
      'author_name',
      'created_at',
      'id',
      'input_modalities',
      'name',
      'output_modalities',
      'providers',
      'reasoning',
      'variant',
      'version_id',
    ])
    expect(model).toEqual({
      // * From "NVIDIA: …" prefix — matches Convex materialize, not author_display_name.
      author_name: 'NVIDIA',
      created_at: '2025-10-28T18:19:25.723Z',
      id: 'nvidia/nemotron-nano-12b-v2-vl:free',
      input_modalities: ['image', 'text', 'video'],
      name: 'Nemotron Nano 12B 2 VL (free)',
      output_modalities: ['text'],
      providers: [],
      reasoning: true,
      variant: 'free',
      version_id: 'nvidia/nemotron-nano-12b-v2-vl:free',
    })
  })

  test('author_name falls back to author slug when name has no colon', () => {
    const modelObs = decodeModelOption({
      author: 'voyageai',
      created_at: '2025-10-28T18:19:25.723503+00:00',
      input_modalities: ['text'],
      name: 'Voyage Code 4',
      output_modalities: ['embeddings'],
      permaslug: 'voyageai/voyage-code-4',
      short_name: 'Voyage Code 4',
      slug: 'voyageai/voyage-code-4',
      supports_reasoning: false,
      variant: 'standard',
    })
    expect(Option.isSome(modelObs)).toBe(true)
    if (Option.isNone(modelObs)) {
      return
    }
    expect(toModel(modelObs.value, []).author_name).toBe('voyageai')
  })
})

describe('map composition (prep + decode + toProvider/toModel)', () => {
  test('standard variant keeps slug and short_name from prep', () => {
    const model = mapScope([rawEndpoint])

    expect(model).not.toBeNull()
    expect(model?.id).toBe('nvidia/nemotron-nano-12b-v2-vl')
    expect(model?.version_id).toBe('nvidia/nemotron-nano-12b-v2-vl')
    expect(model?.name).toBe('Nemotron Nano 12B 2 VL')
    expect(model?.variant).toBe('standard')
    expect(model?.providers).toHaveLength(1)
    expect(model?.providers[0]?.provider_id).toBe('openai')
  })

  test('non-standard variant uses model_variant_* and heals short_name', () => {
    const model = mapScope([
      {
        ...rawEndpoint,
        model_variant_permaslug: 'nvidia/nemotron-nano-12b-v2-vl:free',
        model_variant_slug: 'nvidia/nemotron-nano-12b-v2-vl:free',
        variant: 'free',
      },
    ])

    expect(model).not.toBeNull()
    expect(model?.id).toBe('nvidia/nemotron-nano-12b-v2-vl:free')
    expect(model?.version_id).toBe('nvidia/nemotron-nano-12b-v2-vl:free')
    expect(model?.name).toBe('Nemotron Nano 12B 2 VL (free)')
    expect(model?.variant).toBe('free')
  })

  test('one scope with multiple providers maps under one model', () => {
    const model = mapScope([
      {
        ...rawEndpoint,
        provider_display_name: 'OpenAI',
        provider_slug: 'openai',
      },
      {
        ...rawEndpoint,
        provider_display_name: 'Together',
        provider_slug: 'together',
      },
    ])

    expect(model).not.toBeNull()
    expect(model?.id).toBe('nvidia/nemotron-nano-12b-v2-vl')
    expect(model?.providers.map((p) => p.provider_id).toSorted()).toEqual(['openai', 'together'])
  })

  test('skips disabled endpoints', () => {
    const model = mapScope([
      rawEndpoint,
      {
        ...rawEndpoint,
        is_disabled: true,
        provider_display_name: 'Disabled Co',
        provider_slug: 'disabled',
      },
    ])

    expect(model?.providers).toHaveLength(1)
    expect(model?.providers[0]?.provider_id).toBe('openai')
  })

  test('returns null when all endpoints disabled', () => {
    expect(
      mapScope([
        {
          ...rawEndpoint,
          is_disabled: true,
        },
      ]),
    ).toBeNull()
  })

  test('returns null on empty / invalid prep input', () => {
    expect(mapScope([])).toBeNull()
    expect(mapScope([{}])).toBeNull()
  })

  test('skips endpoints that fail V2 revalidation', () => {
    const model = mapScope([
      rawEndpoint,
      {
        // * Prep identity only — missing V2 provider fields
        model: embeddedModel,
        model_variant_permaslug: 'nvidia/nemotron-nano-12b-v2-vl',
        model_variant_slug: 'nvidia/nemotron-nano-12b-v2-vl',
        variant: 'standard',
      },
    ])

    expect(model?.providers).toHaveLength(1)
  })
})
