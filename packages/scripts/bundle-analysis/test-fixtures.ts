// oxlint-disable sort-keys -- Fixtures mirror source data order.

import type { LoadedModelEndpointsV1 } from '../model-endpoints-v1.ts'
import { ModelEndpointsV1Schema } from '../model-endpoints-v1.ts'

export const endpointId = '00000000-0000-4000-8000-000000000001'
export const otherEndpointId = '00000000-0000-4000-8000-000000000002'

export function sources(
  ...bundles: Array<ReturnType<typeof bundle>>
): AsyncIterable<LoadedModelEndpointsV1> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const [index, value] of bundles.entries()) {
        yield { bundle: value, path: `/bundles/${index}.json` }
      }
    },
  }
}

export function source(bundleValue: ReturnType<typeof bundle>): LoadedModelEndpointsV1 {
  return { bundle: bundleValue, path: `/bundles/${bundleValue.crawl_id}.json` }
}

export function bundle(crawlId: string, crawlAt: string, endpoints: ReturnType<typeof endpoint>[]) {
  return ModelEndpointsV1Schema.parse({
    bundle_format: 'model-endpoints-v1',
    crawl_at: crawlAt,
    crawl_id: crawlId,
    data: [
      {
        endpoints,
        model: model(),
        model_id: 'example/model',
        variant: 'standard',
      },
    ],
  })
}

export function endpoint(overrides: Record<string, unknown> = {}) {
  return {
    adapter_name: 'example',
    allowed_passthrough_parameters: [],
    can_abort: true,
    context_length: 131_072,
    data_policy: {
      canPublish: false,
      retainsPrompts: false,
      training: false,
      trainingOpenRouter: false,
    },
    deprecation_date: null,
    display_pricing: [displayRow()],
    features: {
      supports_tool_choice: {
        literal_auto: true,
        literal_none: true,
        literal_required: true,
        type_function: true,
      },
    },
    has_chat_completions: true,
    has_completions: false,
    id: endpointId,
    is_byok: false,
    is_deranked: false,
    is_disabled: false,
    is_free: false,
    is_hidden: false,
    is_private: false,
    limit_rpd: null,
    limit_rpm: null,
    max_completion_tokens: null,
    max_prompt_tokens: null,
    max_tokens_per_image: null,
    model_variant_permaslug: 'example/model',
    model_variant_slug: 'example/model',
    moderation_required: false,
    name: 'Example endpoint',
    pricing: pricing(),
    pricing_json: { 'example:prompt': '0.000001' },
    pricing_version_id: 'version-1',
    provider_display_name: 'Example',
    provider_info: providerInfo(),
    provider_model_id: 'example/model',
    provider_name: 'Example',
    provider_region: null,
    provider_slug: 'example',
    quantization: 'future-quantization',
    supported_parameters: ['future_parameter'],
    supported_video_parameters: null,
    supports_multipart: false,
    supports_reasoning: false,
    supports_tool_parameters: true,
    variant: 'future-variant',
    ...overrides,
  }
}

export function model(overrides: Record<string, unknown> = {}) {
  return {
    author: 'example',
    author_display_name: 'Example',
    context_length: 131_072,
    created_at: '2026-08-24T00:00:00.000Z',
    default_order: [],
    default_parameters: null,
    default_stops: [],
    default_system: null,
    description: 'Example model',
    features: null,
    group: 'Future group',
    has_text_output: true,
    hf_slug: null,
    hf_updated_at: null,
    hidden: false,
    input_modalities: ['future-modality'],
    instruct_type: null,
    is_private: false,
    is_trainable_image: null,
    is_trainable_text: null,
    knowledge_cutoff: null,
    limit_rpd: null,
    limit_rpm: null,
    model_version_group_id: null,
    name: 'Example model',
    output_modalities: ['future-modality'],
    permaslug: 'example/model',
    promotion_message: null,
    quick_start_example_type: null,
    reasoning_config: null,
    router: null,
    routing_error_message: null,
    short_name: 'Example',
    slug: 'example/model',
    supported_tts_voices: null,
    supports_reasoning: false,
    updated_at: '2026-08-24T00:00:00.000Z',
    warning_message: null,
    ...overrides,
  }
}

export function pricing(overrides: Record<string, unknown> = {}) {
  return {
    completion: '0.000002',
    discount: 0,
    display_pricing: [displayRow()],
    prompt: '0.000001',
    ...overrides,
  }
}

export function displayRow(overrides: Record<string, unknown> = {}) {
  return {
    displayMultiplier: 1_000_000,
    kind: 'token',
    price: '1e-6',
    sku_label: 'Input price',
    unitLabel: '/M tokens',
    ...overrides,
  }
}

function providerInfo() {
  return {
    adapterName: 'example',
    baseUrl: 'https://example.com',
    byokEnabled: false,
    dataPolicy: {
      canPublish: false,
      retainsPrompts: false,
      training: false,
      trainingOpenRouter: false,
    },
    datacenters: ['FUTURE'],
    displayName: 'Example',
    hasChatCompletions: true,
    hasCompletions: false,
    headquarters: 'FUTURE',
    icon: { className: 'future-class', url: 'https://example.com/icon.svg' },
    isAbortable: true,
    moderationRequired: false,
    name: 'Example',
    pricingStrategy: 'standard',
    sendClientIp: false,
    slug: 'example',
    statusPageUrl: null,
  }
}
