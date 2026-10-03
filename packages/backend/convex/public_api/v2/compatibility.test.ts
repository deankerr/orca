import { expect, test } from 'bun:test'

import { ScanEntry } from '../../scan/collected'
import { transformScanToV2Models } from './compatibility'
import { OrcaPublicApiV2Schema } from './schema'

test('complete scans preserve V2 coverage and legacy field meanings', () => {
  const scanAt = '2026-10-01T00:00:00.000Z'
  const endpoint = {
    id: 'endpoint',
    variant: 'beta',
    provider_slug: 'provider/region',
    provider_info: { displayName: 'Provider' },
    provider_display_name: 'Different label',
    model_variant_slug: 'author/model:beta',
    context_length: 1000,
    provider_region: 'region',
    supported_parameters: ['temperature', 'tools'],
    supports_reasoning: true,
    has_completions: false,
    has_chat_completions: true,
    is_disabled: false,
    is_deranked: false,
    moderation_required: true,
    features: {},
    data_policy: {},
    stats: { p50_latency: 0, p50_throughput: 42 },
    pricing: { prompt: '0', completion: '0.000002', input_audio_cache: '0.000001', request: '2' },
  }
  const entry = ScanEntry.parse({
    model_id: 'author/model:beta',
    variant: 'beta',
    model: {
      slug: 'author/model',
      permaslug: 'author/model-v1',
      name: 'Author: Model',
      short_name: 'Model (self-moderated)',
      author: 'author',
      created_at: scanAt,
      input_modalities: ['text'],
      output_modalities: ['image'],
    },
    endpoints: [endpoint, { ...endpoint, id: 'disabled', is_disabled: true }],
  })
  const models = transformScanToV2Models([entry])
  expect(OrcaPublicApiV2Schema.parse({ updated_at: scanAt, models }).models).toEqual([
    {
      id: 'author/model:beta',
      version_id: 'author/model-v1',
      name: 'Model (self-moderated)',
      author_name: 'Author',
      variant: 'beta',
      created_at: scanAt,
      input_modalities: ['text'],
      output_modalities: ['image'],
      reasoning: true,
      providers: [
        {
          provider_id: 'provider/region',
          provider_name: 'Provider',
          provider_region: 'region',
          context_length: 1000,
          pricing: {
            text_input: null,
            text_output: '0.000002',
            image_input: null,
            image_output: null,
            audio_input: null,
            audio_cache_write: '0.000001',
            text_cache_read: null,
            text_cache_write: null,
            reasoning_output: null,
            per_request: '2',
            tiers: null,
          },
          supported_parameters: ['temperature', 'tools'],
          quantization: 'unknown',
          data_policy: {
            may_publish_data: false,
            may_retain_data: false,
            data_retention_days: null,
            may_train_on_data: false,
            shares_user_id: false,
          },
          limits: {
            text_input_tokens: null,
            text_output_tokens: null,
            image_input_tokens: null,
            images_per_input: null,
            requests_per_minute: null,
            requests_per_day: null,
          },
          completions: false,
          chat_completions: true,
          deranked: false,
          implicit_caching: false,
          moderated: true,
          native_web_search: false,
          stats_last_30m: { latency_ms_p50: 0, tokens_per_sec_p50: 42 },
        },
      ],
    },
  ])
  entry.endpoints = ScanEntry.parse({
    ...entry,
    endpoints: [{ ...endpoint, stats: { p50_latency: null, p50_throughput: 42 } }],
  }).endpoints
  expect(transformScanToV2Models([entry])[0].providers[0].stats_last_30m).toBeNull()
  entry.endpoints = null
  expect(transformScanToV2Models([entry])).toEqual([])
})
