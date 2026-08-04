import { describe, expect, test } from 'bun:test'

import type { CoreEndpoint, CoreModel } from '@orca/schema/archive-core.ts'

import { materialize } from '../src/projection/materialize.ts'

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
  provider_name: 'provider',
  provider_region: null,
  provider_slug: 'provider',
  quantization: null,
  supported_parameters: ['tools'],
  supports_reasoning: false,
  supports_tool_parameters: true,
  variant: 'standard',
} satisfies CoreEndpoint

const rawBundle = (value: unknown, crawlId = '1') => ({
  bytes: new TextEncoder().encode(JSON.stringify(value)),
  crawlId,
})

describe('raw bundle materialization', () => {
  test('filters at read time and deduplicates authoritative endpoint model copies', () => {
    const latestModel = { ...model, name: 'Last endpoint copy wins' }
    const result = materialize(
      rawBundle({
        args: { legacy: true },
        crawl_id: '1',
        data: {
          analytics: { large: true },
          models: [
            {
              endpoints: [
                { ...endpoint, model, stats: { p50_latency: 100 } },
                { ...endpoint, id: 'endpoint-2', model: latestModel },
              ],
              model: { ...model, name: 'Ignored scope model' },
            },
            {
              endpoints: [{ id: 'image-endpoint', model: { output_modalities: ['image'] } }],
              model: { output_modalities: ['image'], slug: 'image/model' },
            },
          ],
          providers: [{ id: 'unused' }],
        },
      }),
    )

    expect(result._tag).toBe('Accepted')
    if (result._tag === 'Accepted') {
      expect(result.batch.models).toEqual([latestModel])
      expect(result.batch.endpoints.map((item) => item.endpoint.id)).toEqual([
        'endpoint-2',
        'endpoint-id',
      ])
      expect(result.batch.endpoints[1]?.metrics).toEqual({ p50Latency: 100 })
    }
  })

  test('drops empty catalogs and failed text endpoint scopes', () => {
    expect(materialize(rawBundle({ crawl_id: '1', data: { models: [] } }))).toMatchObject({
      _tag: 'Dropped',
      reason: 'empty-catalog',
    })
    expect(
      materialize(
        rawBundle({
          crawl_id: '1',
          data: { models: [{ endpoints: { status: 500 }, model }] },
        }),
      ),
    ).toMatchObject({ _tag: 'Dropped', reason: 'failed-text-endpoint-scope' })
  })

  test('rejects a raw crawl id that disagrees with its archive row', () => {
    expect(() => materialize(rawBundle({ crawl_id: '2', data: { models: [] } }, '1'))).toThrow(
      'mismatched bundle crawl id',
    )
  })
})
