import { describe, expect, test } from 'bun:test'

import type { CoreEndpoint, CoreModel } from '@orca/schema/archive-core.ts'

import { canonicalJson, createEvent } from '../src/history/diff.ts'
import { advanceState, diffStates } from '../src/history/replay.ts'

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

const identity = {
  entityId: endpoint.id,
  entityType: 'endpoint' as const,
  modelSlug: 'author/model',
  providerName: endpoint.provider_name,
  providerSlug: endpoint.provider_slug,
}

describe('core history diff', () => {
  test('groups raw-path field changes into one deterministic entity event', () => {
    const after = {
      ...endpoint,
      pricing: { ...endpoint.pricing, prompt: '0.000003' },
      supported_parameters: ['tools', 'response_format'],
    }
    const event = createEvent({
      after,
      before: endpoint,
      crawlId: '2',
      identity,
      previousCrawlId: '1',
    })

    expect(event?.eventType).toBe('updated')
    expect(event?.fields.map((field) => field.path)).toEqual([
      'pricing.prompt',
      'supported_parameters',
    ])
    expect(event?.fields[1]?.before).toEqual(['tools'])
    expect(event?.fields[1]?.after).toEqual(['tools', 'response_format'])
    expect(createEvent({ after, before: endpoint, crawlId: '2', identity })?.eventId).toBe(
      event?.eventId,
    )
  })

  test('distinguishes an absent field from an explicit null', () => {
    const before = { ...endpoint, pricing: { ...endpoint.pricing, request: undefined } }
    const after = { ...endpoint, pricing: { ...endpoint.pricing, request: '0' } }
    const event = createEvent({ after, before, crawlId: '2', identity })

    expect(event?.fields).toContainEqual({
      after: '0',
      afterPresent: true,
      before: undefined,
      beforePresent: false,
      path: 'pricing.request',
    })
  })

  test('canonical JSON ignores object insertion order but preserves array order', () => {
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ a: 1, b: 2 }))
    expect(canonicalJson(['b', 'a'])).not.toBe(canonicalJson(['a', 'b']))
  })

  test('a failed scope preserves state and a successful empty scope makes it unavailable', () => {
    const modelSlug = 'author/model'
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
      slug: modelSlug,
      warning_message: null,
    } satisfies CoreModel
    const item = { endpoint, metrics: undefined, modelSlug }
    const initial = {
      endpoints: new Map([[endpoint.id, item]]),
      models: new Map([[modelSlug, model]]),
    }
    const failed = advanceState(initial, {
      crawlId: '2',
      endpointFetchFailures: 1,
      endpoints: [],
      failedModelSlugs: new Set([modelSlug]),
      models: [],
    })
    expect(diffStates(initial, failed, '2', '1')).toHaveLength(0)

    const unavailable = advanceState(failed, {
      crawlId: '3',
      endpointFetchFailures: 0,
      endpoints: [],
      failedModelSlugs: new Set(),
      models: [],
    })
    expect(diffStates(failed, unavailable, '3', '2').map((event) => event.eventType)).toEqual([
      'unavailable',
      'unavailable',
    ])
  })
})
