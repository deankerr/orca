import { expect, test } from 'vitest'

import type { ScanEntry } from '#scans/collection'

import { transformScanToV2Models } from './compatibility'
import { OrcaPublicApiV2Schema } from './schema'

test('complete scans preserve V2 coverage and legacy field meanings', () => {
  const scanAt = '2026-10-01T00:00:00.000Z'

  const endpoint = {
    context_length: 1000,
    data_policy: {},
    features: {},
    has_chat_completions: true,
    has_completions: false,
    id: 'endpoint',
    is_deranked: false,
    is_disabled: false,
    model_variant_slug: 'author/model:beta',
    moderation_required: true,
    pricing: { completion: '0.000002', input_audio_cache: '0.000001', prompt: '0', request: '2' },
    provider_display_name: 'Different label',
    provider_info: { displayName: 'Provider' },
    provider_region: 'region',
    provider_slug: 'provider/region',
    stats: { p50_latency: 0, p50_throughput: 42 },
    supported_parameters: ['temperature', 'tools'],
    supports_reasoning: true,
    variant: 'beta',
  }

  const entry: ScanEntry = {
    endpoints: [endpoint, { ...endpoint, id: 'disabled', is_disabled: true }],
    model: {
      author: 'author',
      created_at: scanAt,
      input_modalities: ['text'],
      name: 'Author: Model',
      output_modalities: ['image'],
      permaslug: 'author/model-v1',
      short_name: 'Model (self-moderated)',
      slug: 'author/model',
    },
    model_id: 'author/model:beta',
    variant: 'beta',
  }

  const models = transformScanToV2Models([entry])

  expect(OrcaPublicApiV2Schema.parse({ models, updated_at: scanAt }).models).toEqual([
    {
      author_name: 'Author',
      created_at: scanAt,
      id: 'author/model:beta',
      input_modalities: ['text'],
      name: 'Model (self-moderated)',
      output_modalities: ['image'],
      providers: [
        {
          chat_completions: true,
          completions: false,
          context_length: 1000,
          data_policy: {
            data_retention_days: null,
            may_publish_data: false,
            may_retain_data: false,
            may_train_on_data: false,
            shares_user_id: false,
          },
          deranked: false,
          implicit_caching: false,
          limits: {
            image_input_tokens: null,
            images_per_input: null,
            requests_per_day: null,
            requests_per_minute: null,
            text_input_tokens: null,
            text_output_tokens: null,
          },
          moderated: true,
          native_web_search: false,
          pricing: {
            audio_cache_write: '0.000001',
            audio_input: null,
            image_input: null,
            image_output: null,
            per_request: '2',
            reasoning_output: null,
            text_cache_read: null,
            text_cache_write: null,
            text_input: null,
            text_output: '0.000002',
            tiers: null,
          },
          provider_id: 'provider/region',
          provider_name: 'Provider',
          provider_region: 'region',
          quantization: 'unknown',
          stats_last_30m: { latency_ms_p50: 0, tokens_per_sec_p50: 42 },
          supported_parameters: ['temperature', 'tools'],
        },
      ],
      reasoning: true,
      variant: 'beta',
      version_id: 'author/model-v1',
    },
  ])

  entry.endpoints = [{ ...endpoint, stats: { p50_latency: null, p50_throughput: 42 } }]
  expect(transformScanToV2Models([entry])[0].providers[0].stats_last_30m).toBeNull()
  entry.endpoints = null
  expect(transformScanToV2Models([entry])).toEqual([])
})
