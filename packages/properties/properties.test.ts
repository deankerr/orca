import type { Endpoint } from '@orca/contract/endpoint'
import type { Model } from '@orca/contract/model'
import type { Provider } from '@orca/contract/provider'
import { describe, expect, it } from 'vitest'

import { activeProperties, isPropertyId, properties } from './index'
import type { Scope } from './index'

const AT = '2026-10-28T00:00:00.000Z'

function endpoint(overrides: Partial<Endpoint> = {}): Endpoint {
  return {
    allowed_passthrough_parameters: null,
    can_abort: null,
    context_length: 131_072,
    created_at: '2026-01-01T00:00:00.000Z',
    data_policy: {
      can_publish: null,
      requires_user_ids: null,
      retains_prompts: null,
      retention_days: null,
      safety_retention: null,
      training: null,
      training_openrouter: null,
    },
    deprecation_date: null,
    has_chat_completions: true,
    has_completions: null,
    id: 'endpoint-1',
    input_modalities: ['text'],
    is_byok_only: null,
    is_deranked: null,
    is_disabled: null,
    is_mandatory_reasoning: null,
    is_zdr: null,
    label: 'DeepInfra',
    limit_rpd: null,
    limit_rpm: null,
    max_completion_tokens: null,
    max_prompt_tokens: null,
    max_tokens_per_image: null,
    model: {
      created_at: '2026-01-01T00:00:00.000Z',
      id: 'moonshotai/kimi-k3',
      name: 'Kimi K3',
      variant: 'standard',
    },
    moderation_required: null,
    output_modalities: ['text'],
    pricing: {
      audio: null,
      audio_output: null,
      discount: 0,
      image: null,
      image_output: null,
      input: '0.0000006',
      input_audio_cache: null,
      input_cache_read: null,
      input_cache_write: null,
      input_cache_write_1h: null,
      output: '0.0000025',
      overrides: null,
      web_search: null,
    },
    provider: {
      display_name: 'DeepInfra',
      id: 'deepinfra',
      name: 'DeepInfra',
      tag: 'deepinfra/fp8',
    },
    provider_region: null,
    quantization: null,
    service_tier: null,
    service_tier_label: null,
    stats: { p50_latency_ms: null, p50_throughput_tps: null },
    supported_parameters: null,
    supports_native_apply_patch: null,
    supports_native_web_fetch: null,
    supports_native_web_search: null,
    supports_reasoning: null,
    tool_choice: { auto: null, function: null, none: null, required: null },
    unlisted_at: null,
    ...overrides,
  }
}

function model(overrides: Partial<Model> = {}): Model {
  return {
    author: { id: 'moonshotai', name: null },
    created_at: '2026-01-01T00:00:00.000Z',
    default_parameters: null,
    deprecation_date: null,
    description: 'A model.',
    hf_slug: null,
    id: 'moonshotai/kimi-k3',
    input_modalities: ['text'],
    knowledge_cutoff: null,
    listed_endpoints: 1,
    merges_system_messages: null,
    name: 'Kimi K3',
    output_modalities: ['text'],
    permaslug: 'moonshotai/kimi-k3-20260101',
    provider_ids: ['deepinfra'],
    reasoning_config: {
      default_reasoning_effort: null,
      default_reasoning_enabled: null,
      is_mandatory_reasoning: null,
      reasoning_return_mechanism: null,
      supported_reasoning_efforts: null,
      supports_reasoning_max_tokens: null,
    },
    supports_reasoning: null,
    variant: 'standard',
    warning_message: null,
    ...overrides,
  }
}

function provider(overrides: Partial<Provider> = {}): Provider {
  return {
    byok_enabled: null,
    datacenters: null,
    display_name: 'DeepInfra',
    headquarters: null,
    id: 'deepinfra',
    listed_endpoints: 1,
    listed_models: 1,
    name: 'DeepInfra',
    privacy_policy_url: null,
    status_page_url: null,
    terms_of_service_url: null,
    ...overrides,
  }
}

function scope(overrides: Partial<Scope> = {}): Scope {
  return { at: AT, endpoint: endpoint(), model: model(), provider: provider(), ...overrides }
}

const active = (overrides: Partial<Scope>) => [...activeProperties(scope(overrides)).keys()]

describe('properties', () => {
  it('treats null and false alike as inactive', () => {
    expect(activeProperties(scope())).toEqual(new Map())
    expect(active({ endpoint: endpoint({ can_abort: true, is_zdr: false }) })).toEqual([])
  })

  it('applies model and provider properties to the endpoint', () => {
    const resolved = activeProperties(
      scope({
        endpoint: endpoint({ supports_reasoning: false }),
        model: model({ hf_slug: 'moonshotai/Kimi-K3', supports_reasoning: true }),
        provider: provider({ byok_enabled: true, headquarters: 'US' }),
      }),
    )

    expect(resolved).toEqual(
      new Map<string, unknown>([
        ['reasoning', true],
        ['byok', true],
        ['open_weights', true],
        ['headquarters', 'US'],
      ]),
    )
  })

  it('inherits mandatory reasoning from either the endpoint or the model', () => {
    const mandatory = { ...model().reasoning_config, is_mandatory_reasoning: true }

    expect(active({ endpoint: endpoint({ is_mandatory_reasoning: true }) })).toEqual([
      'reasoning_mandatory',
    ])
    expect(active({ model: model({ reasoning_config: mandatory }) })).toEqual([
      'reasoning_mandatory',
    ])
  })

  it('is active without a value when retention days are unstated', () => {
    const retained = (retention_days: number | null) =>
      properties.prompt_retention.resolve(
        scope({
          endpoint: endpoint({
            data_policy: { ...endpoint().data_policy, retains_prompts: true, retention_days },
          }),
        }),
      )

    expect(retained(30)).toBe(30)
    expect(retained(null)).toBe(true)
  })

  it('counts tool-choice modes only alongside the tool_choice parameter', () => {
    const tool_choice = { auto: true, function: true, none: true, required: true }

    const accepting = (supported_parameters: string[]) =>
      active({ endpoint: endpoint({ supported_parameters, tool_choice }) })

    expect(accepting(['tools'])).toEqual(['tools'])
    expect(accepting(['tools', 'tool_choice'])).toEqual([
      'tools',
      'tool_choice',
      'tool_choice_required',
      'tool_choice_named',
    ])
  })

  it('prices native web search, ignoring prices without it', () => {
    const search = (supports_native_web_search: boolean, web_search: string | null) =>
      properties.native_web_search.resolve(
        scope({
          endpoint: endpoint({
            pricing: { ...endpoint().pricing, web_search },
            supports_native_web_search,
          }),
        }),
      )

    expect(search(true, '0.01')).toBe('0.01')
    expect(search(true, null)).toBe(true)
    expect(search(false, '0.01')).toBeNull()
  })

  it('judges recency against the scope time', () => {
    const created_at = '2026-10-20T00:00:00.000Z'

    expect(active({ endpoint: endpoint({ created_at }), model: model({ created_at }) })).toEqual([
      'new_endpoint',
      'new_model',
    ])
  })

  it('takes the earliest of endpoint and model deprecation dates', () => {
    const deprecating = scope({
      endpoint: endpoint({ deprecation_date: '2026-12-31T00:00:00.000Z' }),
      model: model({ deprecation_date: '2026-11-15T00:00:00.000Z' }),
    })

    expect(properties.deprecating.resolve(deprecating)).toBe('2026-11-15T00:00:00.000Z')
  })

  it('ignores parameters without a default value', () => {
    const default_parameters = { temperature: 0.6, top_p: null }

    expect(
      properties.sampling_defaults.resolve(scope({ model: model({ default_parameters }) })),
    ).toEqual(['temperature'])
  })

  it('derives pricing properties from the quote', () => {
    const pricing = {
      ...endpoint().pricing,
      discount: 0.25,
      input_cache_read: '0',
      overrides: [{ min_prompt_tokens: 200_000 }, { utc_end: '06:00', utc_start: '22:00' }],
    }

    expect(active({ endpoint: endpoint({ pricing }) })).toEqual([
      'caching',
      'long_context_pricing',
      'peak_pricing',
      'discount',
    ])
  })

  it('counts any UTC condition as scheduled pricing', () => {
    const overrides = [{ utc_days: ['saturday'] }]
    const pricing = { ...endpoint().pricing, overrides }

    expect(active({ endpoint: endpoint({ pricing }) })).toEqual(['peak_pricing'])
  })

  it('excludes values that state nothing notable', () => {
    const pricing = { ...endpoint().pricing, discount: -0.2 }

    expect(
      active({
        endpoint: endpoint({
          context_length: 131_072,
          limit_rpm: 0,
          max_prompt_tokens: 131_072,
          pricing,
          quantization: 'unknown',
        }),
      }),
    ).toEqual([])
  })

  it('recognizes property IDs', () => {
    expect(isPropertyId('zdr')).toBe(true)
    expect(isPropertyId('toString')).toBe(false)
  })
})
