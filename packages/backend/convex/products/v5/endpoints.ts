import { Endpoint, MeterRate } from '@orca/contract/endpoint'
import type { Provider } from '@orca/contract/provider'
import { mergeDeep } from 'remeda'
import { z } from 'zod'

import { decodePricing } from '../../catalog/pricing'
import type { CurrentEndpointRow, CurrentStatsRow } from '../../catalog/tables/current'
import type { EventRow } from '../../catalog/tables/events'
import { flagOrNull, isoDate, stringsOrNull, textOrNull } from '../../fields'
import { JsonObject, JsonObjectFromString } from '../../json'
import { field, project, translateStored } from './projection'
import type { Fields, Kind, KindValues } from './projection'

// Malformed optional facts are unknown, not invented defaults.
const count = z.number().int().nonnegative().nullable().catch(null)
const text = z.string()
const strings = z.array(z.string())

const Overrides = z
  .array(JsonObject)
  .optional()
  .transform((overrides) => overrides ?? null)

// Declared meters only: a new upstream meter is unpublished until curated. `internal_reasoning` is
// omitted because its rates have been misleading across many endpoints.
const meter = (key: string) =>
  field('price', ['pricing', 'meters', key], MeterRate.nullable().catch(null))

const fact = <K extends Kind>(kind: K, key: string, schema: z.ZodType<KindValues[K]>) =>
  field(kind, ['metadata', key], schema)

const policy = <K extends Kind>(kind: K, key: string, schema: z.ZodType<KindValues[K]>) =>
  field(kind, ['metadata', 'data_policy', key], schema)

type EndpointEventRow = Extract<EventRow, { entity_kind: 'endpoint' }>

/** Endpoint Contract fields read from the catalog entity; context fields are added by `toEndpoint`. */
export const endpointFields = {
  context_length: fact('count', 'context_length', count),
  'data_policy.can_publish': policy('flag', 'canPublish', flagOrNull),
  'data_policy.requires_user_ids': policy('flag', 'requiresUserIDs', flagOrNull),
  'data_policy.retains_prompts': policy('flag', 'retainsPrompts', flagOrNull),
  'data_policy.retention_days': policy('count', 'retentionDays', count),
  'data_policy.training': policy('flag', 'training', flagOrNull),
  has_chat_completions: fact('flag', 'has_chat_completions', flagOrNull),
  has_completions: fact('flag', 'has_completions', flagOrNull),
  id: field('text', ['endpoint_id'], text),
  input_modalities: field('list', ['input_modalities'], strings),
  is_deranked: fact('flag', 'is_deranked', flagOrNull),
  is_disabled: fact('flag', 'is_disabled', flagOrNull),
  is_zdr: fact('flag', 'is_zdr', flagOrNull),
  label: field('text', ['provider_display_name'], text),
  limit_rpd: fact('count', 'limit_rpd', count),
  limit_rpm: fact('count', 'limit_rpm', count),
  max_completion_tokens: fact('count', 'max_completion_tokens', count),
  max_prompt_tokens: fact('count', 'max_prompt_tokens', count),
  max_tokens_per_image: fact('count', 'max_tokens_per_image', count),
  'model.created_at': field('text', ['model_or_created_at'], isoDate),
  'model.id': field('text', ['model_id'], text),
  'model.name': field('text', ['model_display_name'], text),
  'model.variant': field('text', ['variant'], text),
  moderation_required: fact('flag', 'moderation_required', flagOrNull),
  output_modalities: field('list', ['output_modalities'], strings),
  'pricing.audio': meter('audio'),
  'pricing.audio_output': meter('audio_output'),
  'pricing.discount': field('percent', ['pricing', 'discount'], z.number()),
  'pricing.image': meter('image'),
  'pricing.image_output': meter('image_output'),
  'pricing.input': meter('prompt'),
  'pricing.input_audio_cache': meter('input_audio_cache'),
  'pricing.input_cache_read': meter('input_cache_read'),
  'pricing.input_cache_write': meter('input_cache_write'),
  'pricing.input_cache_write_1h': meter('input_cache_write_1h'),
  'pricing.output': meter('completion'),
  'pricing.overrides': field('opaque', ['pricing', 'overrides'], Overrides),
  'pricing.web_search': meter('web_search'),
  'provider.id': field('text', ['provider_id'], text),
  'provider.tag': field('text', ['provider_tag'], text),
  quantization: fact('text', 'quantization', textOrNull),
  supported_parameters: fact('list', 'supported_parameters', stringsOrNull),
  supports_native_web_search: field(
    'flag',
    ['metadata', 'features', 'supports_native_web_search'],
    flagOrNull,
  ),
  supports_reasoning: fact('flag', 'supports_reasoning', flagOrNull),
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
  provider: Pick<Provider, 'display_name' | 'name'> | undefined,
): Endpoint {
  const fields = project(endpointFields, toEntity(row))
  const listedStats = row.unlisted_at === undefined ? stats : undefined

  // Context fields join the declared projection, nested beside its own fields.
  return Endpoint.parse(
    mergeDeep(fields, {
      // Endpoint labels vary within a provider; the provider entity holds its own names.
      provider: {
        display_name: provider?.display_name ?? row.provider_display_name,
        name: provider?.name ?? row.provider_display_name,
      },
      stats: {
        p50_latency_ms: listedStats?.p50_latency ?? null,
        p50_throughput_tps: listedStats?.p50_throughput ?? null,
      },
      unlisted_at: row.unlisted_at ?? null,
    }),
  )
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
