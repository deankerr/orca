import { describe, expect, test } from 'bun:test'

import { materializeCore } from '../src/core-sqlite.ts'

const model = {
  author: 'author',
  context_length: 4096,
  created_at: '2025-01-01T00:00:00Z',
  description: 'Description',
  endpoint: { variant: 'standard' },
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
  upstream_internal_field: 'deliberately ignored',
  warning_message: null,
}

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
  model,
  model_variant_permaslug: 'author/model-20250101',
  model_variant_slug: 'author/model',
  moderation_required: false,
  pricing: { completion: '0.000002', prompt: '0.000001' },
  provider_display_name: 'Provider',
  provider_model_id: 'model',
  provider_name: 'provider',
  provider_region: null,
  provider_slug: 'provider',
  quantization: null,
  stats: { p50_latency: 100, p50_throughput: 50, volatile: true },
  supported_parameters: ['tools'],
  supports_reasoning: false,
  supports_tool_parameters: true,
  variant: 'standard',
}

describe('core archive materialization', () => {
  test('selects text entities, ignores excess fields, and isolates metrics', () => {
    const batch = materializeCore({
      crawl_id: '1',
      data: {
        models: [
          { endpoints: [endpoint], model },
          { endpoints: { status: 500 }, model: { ...model, slug: 'failed/model' } },
          {
            endpoints: [
              { ...endpoint, id: 'image', model: { ...model, output_modalities: ['image'] } },
            ],
            model: { ...model, output_modalities: ['image'] },
          },
        ],
      },
    })

    expect(batch.models).toHaveLength(1)
    expect(batch.endpoints).toHaveLength(1)
    expect(batch.endpointFetchFailures).toBe(1)
    expect(batch.failedModelSlugs).toEqual(new Set(['failed/model']))
    expect(batch.models[0]).not.toHaveProperty('upstream_internal_field')
    expect(batch.endpoints[0]?.endpoint).not.toHaveProperty('stats')
    expect(batch.endpoints[0]?.metrics).toEqual({ p50_latency: 100, p50_throughput: 50 })
  })
})
