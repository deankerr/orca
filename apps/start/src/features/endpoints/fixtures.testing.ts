import type { Endpoint } from '@orca/contract/endpoint'
import type { Model } from '@orca/contract/model'
import type { Provider } from '@orca/contract/provider'

import type { Snapshot } from './rows'

export const AT = '2026-10-28T00:00:00.000Z'

function model(id: string, overrides: Partial<Model> = {}): Model {
  return {
    author: { id: id.split('/')[0] ?? id, name: null },
    created_at: '2026-01-01T00:00:00.000Z',
    default_parameters: null,
    deprecation_date: null,
    description: '',
    hf_slug: null,
    id,
    input_modalities: ['text'],
    knowledge_cutoff: null,
    listed_endpoints: 1,
    merges_system_messages: null,
    name: id,
    output_modalities: ['text'],
    permaslug: id,
    provider_ids: [],
    reasoning_config: {
      default_reasoning_effort: null,
      default_reasoning_enabled: null,
      is_mandatory_reasoning: null,
      reasoning_return_mechanism: null,
      supported_reasoning_efforts: null,
      supports_reasoning_max_tokens: null,
    },
    supports_reasoning: null,
    variant: id.includes(':') ? (id.split(':')[1] ?? 'standard') : 'standard',
    warning_message: null,
    ...overrides,
  }
}

function provider(id: string, overrides: Partial<Provider> = {}): Provider {
  return {
    byok_enabled: null,
    datacenters: null,
    display_name: id,
    headquarters: null,
    id,
    listed_endpoints: 1,
    listed_models: 1,
    name: id,
    privacy_policy_url: null,
    status_page_url: null,
    terms_of_service_url: null,
    ...overrides,
  }
}

interface EndpointFixture {
  id: string
  model: Model
  provider: Provider
  /** Per-token rates. */
  input?: string | null
  output?: string | null
  cacheRead?: string | null
  throughput?: number | null
  latency?: number | null
  context?: number | null
  parameters?: string[]
  zdr?: boolean
  unlisted?: boolean
}

export function endpoint({
  id,
  model: { created_at: createdAt, id: modelId, name, variant },
  provider: { display_name: displayName, id: providerId, name: providerName },
  input = '0.000001',
  output = '0.000005',
  cacheRead = null,
  throughput = 100,
  latency = 500,
  context = 128_000,
  parameters = [],
  zdr = false,
  unlisted = false,
}: EndpointFixture): Endpoint {
  return {
    allowed_passthrough_parameters: null,
    can_abort: null,
    context_length: context,
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
    id,
    input_modalities: ['text'],
    is_byok_only: null,
    is_deranked: null,
    is_disabled: null,
    is_mandatory_reasoning: null,
    is_zdr: zdr,
    label: displayName,
    limit_rpd: null,
    limit_rpm: null,
    max_completion_tokens: null,
    max_prompt_tokens: null,
    max_tokens_per_image: null,
    model: { created_at: createdAt, id: modelId, name, variant },
    moderation_required: null,
    output_modalities: ['text'],
    pricing: {
      audio: null,
      audio_output: null,
      discount: 0,
      image: null,
      image_output: null,
      input,
      input_audio_cache: null,
      input_cache_read: cacheRead,
      input_cache_write: null,
      input_cache_write_1h: null,
      output,
      overrides: null,
      web_search: null,
    },
    provider: { display_name: displayName, id: providerId, name: providerName, tag: providerId },
    provider_region: null,
    quantization: null,
    service_tier: null,
    service_tier_label: null,
    stats: {
      p50_latency_ms: unlisted ? null : latency,
      p50_throughput_tps: unlisted ? null : throughput,
    },
    supported_parameters: parameters,
    supports_native_apply_patch: null,
    supports_native_web_fetch: null,
    supports_native_web_search: null,
    supports_reasoning: null,
    tool_choice: { auto: null, function: null, none: null, required: null },
    unlisted_at: unlisted ? '2026-10-20T00:00:00.000Z' : null,
  }
}

export const models = {
  gpt: model('openai/gpt-5', { created_at: '2026-10-10T00:00:00.000Z', name: 'GPT-5' }),
  gptFree: model('openai/gpt-5:free', {
    created_at: '2026-08-15T00:00:00.000Z',
    name: 'GPT-5 (free)',
  }),
  kimi: model('moonshotai/kimi-k3', { created_at: '2025-06-01T00:00:00.000Z', name: 'Kimi K3' }),
}

export const providers = {
  azure: provider('azure', { display_name: 'Azure' }),
  deepinfra: provider('deepinfra', { display_name: 'DeepInfra' }),
  openai: provider('openai', { display_name: 'OpenAI' }),
}

/**
 * Six endpoints:
 * - `gpt-openai`: GPT-5 on OpenAI, $1.25/$10, tools, ZDR, 80 tok/s, 400k context.
 * - `gpt-azure`: GPT-5 on Azure, $1.25/$10, tools, 60 tok/s, 400k context.
 * - `gpt-free`: GPT-5 (free) on OpenAI, zero rates, no stats.
 * - `kimi-deepinfra`: Kimi K3 on DeepInfra, $0.5/$2, tools, ZDR, 120 tok/s, 256k context.
 * - `kimi-azure`: Kimi K3 on Azure, $0.6/$2.5, 40 tok/s, 128k context.
 * - `kimi-old`: Kimi K3 on OpenAI, unlisted.
 */
export const snapshot: Snapshot = {
  as_at: AT,
  endpoints: [
    endpoint({
      context: 400_000,
      id: 'gpt-openai',
      input: '0.00000125',
      model: models.gpt,
      output: '0.00001',
      parameters: ['tools'],
      provider: providers.openai,
      throughput: 80,
      zdr: true,
    }),
    endpoint({
      cacheRead: '0.000000125',
      context: 400_000,
      id: 'gpt-azure',
      input: '0.00000125',
      model: models.gpt,
      output: '0.00001',
      parameters: ['tools'],
      provider: providers.azure,
      throughput: 60,
    }),
    endpoint({
      id: 'gpt-free',
      input: '0',
      model: models.gptFree,
      output: '0',
      provider: providers.openai,
      throughput: null,
    }),
    endpoint({
      context: 256_000,
      id: 'kimi-deepinfra',
      input: '0.0000005',
      model: models.kimi,
      output: '0.000002',
      parameters: ['tools'],
      provider: providers.deepinfra,
      throughput: 120,
      zdr: true,
    }),
    endpoint({
      id: 'kimi-azure',
      input: '0.0000006',
      model: models.kimi,
      output: '0.0000025',
      provider: providers.azure,
      throughput: 40,
    }),
    endpoint({ id: 'kimi-old', model: models.kimi, provider: providers.openai, unlisted: true }),
  ],
  models: [models.gpt, models.gptFree, models.kimi],
  providers: [providers.azure, providers.deepinfra, providers.openai],
}
