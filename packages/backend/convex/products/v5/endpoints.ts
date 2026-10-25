import { Endpoint, MeterRate } from '@orca/contract/endpoint'
import { isPlainObject } from 'remeda'
import { z } from 'zod'

import { decodePricing } from '../../catalog/pricing'
import type { CurrentEndpointRow, CurrentStatsRow } from '../../catalog/tables/current'
import type { EventRow } from '../../catalog/tables/events'
import { flagOrNull, isoDate, stringsOrNull, textOrNull } from '../../fields'
import { JsonObject, JsonObjectFromString } from '../../json'
import { field, project, translateStored } from './projection'
import type { Fields } from './projection'

// Malformed optional facts are unknown, not invented defaults.
const count = z.number().int().nonnegative().nullable().catch(null)
const text = z.string()
const strings = z.array(z.string())

const Overrides = z.array(JsonObject)

// Declared meters only: a new upstream meter is unpublished until curated. `internal_reasoning` is
// omitted because its rates have been misleading across many endpoints.
const meter = (key: string) => field(['pricing', 'meters', key], MeterRate.nullable().catch(null))

const fact = (key: string, schema: z.ZodType, options?: { set?: true }) =>
  field(['metadata', key], schema, options)
const policy = (key: string, schema: z.ZodType) => field(['metadata', 'data_policy', key], schema)

type EndpointEventRow = Extract<EventRow, { entity_kind: 'endpoint' }>

/** Endpoint Contract fields read from the catalog entity; context fields are added by `toEndpoint`. */
export const endpointFields = {
  context_length: fact('context_length', count),
  'data_policy.can_publish': policy('canPublish', flagOrNull),
  'data_policy.requires_user_ids': policy('requiresUserIDs', flagOrNull),
  'data_policy.retains_prompts': policy('retainsPrompts', flagOrNull),
  'data_policy.retention_days': policy('retentionDays', count),
  'data_policy.training': policy('training', flagOrNull),
  has_chat_completions: fact('has_chat_completions', flagOrNull),
  has_completions: fact('has_completions', flagOrNull),
  id: field(['endpoint_id'], text),
  input_modalities: field(['input_modalities'], strings, { set: true }),
  is_deranked: fact('is_deranked', flagOrNull),
  is_disabled: fact('is_disabled', flagOrNull),
  is_zdr: fact('is_zdr', flagOrNull),
  label: field(['provider_display_name'], text),
  limit_rpd: fact('limit_rpd', count),
  limit_rpm: fact('limit_rpm', count),
  max_completion_tokens: fact('max_completion_tokens', count),
  max_prompt_tokens: fact('max_prompt_tokens', count),
  max_tokens_per_image: fact('max_tokens_per_image', count),
  'model.created_at': field(['model_or_created_at'], isoDate),
  'model.id': field(['model_id'], text),
  'model.name': field(['model_display_name'], text),
  'model.variant': field(['variant'], text),
  moderation_required: fact('moderation_required', flagOrNull),
  output_modalities: field(['output_modalities'], strings, { set: true }),
  'pricing.audio': meter('audio'),
  'pricing.audio_output': meter('audio_output'),
  'pricing.discount': field(['pricing', 'discount'], z.number()),
  'pricing.image': meter('image'),
  'pricing.image_output': meter('image_output'),
  'pricing.input': meter('prompt'),
  'pricing.input_audio_cache': meter('input_audio_cache'),
  'pricing.input_cache_read': meter('input_cache_read'),
  'pricing.input_cache_write': meter('input_cache_write'),
  'pricing.input_cache_write_1h': meter('input_cache_write_1h'),
  'pricing.output': meter('completion'),
  'pricing.overrides': {
    read: (overrides) => (overrides === undefined ? null : Overrides.parse(overrides)),
    sources: [['pricing', 'overrides']],
  },
  'pricing.web_search': meter('web_search'),
  'provider.id': field(['provider_id'], text),
  'provider.tag': field(['provider_tag'], text),
  quantization: fact('quantization', textOrNull),
  supported_parameters: fact('supported_parameters', stringsOrNull, { set: true }),
  supports_native_web_search: field(
    ['metadata', 'features', 'supports_native_web_search'],
    flagOrNull,
  ),
  supports_reasoning: fact('supports_reasoning', flagOrNull),
} satisfies Fields

/** The catalog entity a current row stores, with its storage encodings decoded. */
function toEntity(row: CurrentEndpointRow) {
  return {
    ...row,
    metadata: JsonObjectFromString.parse(row.metadata_json),
    pricing: decodePricing(row.pricing),
  }
}

/** Catalog row to V5 contract; unlisted endpoints carry no current readings. */
export function toEndpoint(
  row: CurrentEndpointRow,
  stats: CurrentStatsRow | undefined,
  providerName: string | undefined,
): Endpoint {
  const fields = project(endpointFields, toEntity(row))
  const listedStats = row.unlisted_at === undefined ? stats : undefined

  return Endpoint.parse({
    ...fields,
    // Endpoint labels vary within a provider; the provider entity holds its own name.
    provider: {
      ...(isPlainObject(fields.provider) ? fields.provider : {}),
      name: providerName ?? row.provider_display_name,
    },
    stats: {
      p50_latency_ms: listedStats?.p50_latency ?? null,
      p50_throughput_tps: listedStats?.p50_throughput ?? null,
    },
    unlisted_at: row.unlisted_at ?? null,
  })
}

/** Stored endpoint UPDATE to Contract field changes; its complete quotes resolve pricing. */
export function translateEndpointUpdate(row: EndpointEventRow) {
  const { pricing } = row.context
  const known =
    pricing === undefined
      ? []
      : [
          {
            after: decodePricing(pricing.after),
            before: decodePricing(pricing.before),
            path: ['pricing'],
          },
        ]

  return translateStored(endpointFields, row.change_json, known)
}
