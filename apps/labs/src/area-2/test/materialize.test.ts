import { describe, expect, test } from 'bun:test'

import type { CoreEndpoint, CoreModel } from '@orca/schema/area-2-core.ts'

import { materialize } from '../materialize.ts'

const model = {
  author: 'author',
  context_length: 4096,
  created_at: '2025-01-01T00:00:00Z',
  description: 'Description',
  group: 'tokenizer',
  hf_slug: null,
  input_modalities: ['text'],
  instruct_type: null,
  name: 'Model',
  output_modalities: ['text'],
  permaslug: 'author/model-20250101',
  reasoning_config: null,
  short_name: 'Model',
  slug: 'author/model',
  warning_message: null,
} satisfies CoreModel

const endpoint = {
  context_length: 4096,
  data_policy: {},
  features: {},
  has_chat_completions: true,
  has_completions: false,
  id: 'endpoint-id',
  is_deranked: false,
  is_disabled: false,
  is_free: false,
  max_completion_tokens: 1024,
  max_prompt_tokens: 3072,
  model_variant_permaslug: 'author/model-20250101',
  model_variant_slug: 'author/model',
  moderation_required: false,
  pricing: { completion: '0.000002', prompt: '0.000001' },
  provider_display_name: 'Provider',
  provider_model_id: 'model',
  provider_name: 'Provider',
  provider_region: null,
  provider_slug: 'provider',
  quantization: null,
  supported_parameters: ['tools'],
  supports_reasoning: false,
  supports_tool_parameters: true,
  variant: 'standard',
} satisfies CoreEndpoint

describe('Area 2 materialization', () => {
  test('uses the core schema to discard telemetry and unknown endpoint fields', () => {
    const result = materialize([
      {
        endpoints: [
          {
            ...endpoint,
            future_endpoint_field: { enabled: true },
            model,
            routing_heuristics_by_tier: { default: {} },
            stats: { p50_latency: 100, p50_throughput: 20 },
            statsByTier: { default: {} },
            status: -2,
            status_heuristics: { uptime: 0.9 },
          },
        ],
        model,
      },
    ])

    expect(result.endpoints[0]?.endpoint).toEqual(endpoint)
    expect(result.endpoints[0]?.metrics).toEqual({ p50Latency: 100, p50Throughput: 20 })
  })
})
