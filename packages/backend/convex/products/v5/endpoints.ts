import { Endpoint, MeterRate } from '@orca/contract/endpoint'
import { z } from 'zod'

import type { CurrentEndpointRow, CurrentStatsRow } from '../../catalog/tables/current'
import { flagOrNull, isoDate, stringsOrNull, textOrNull } from '../../fields'
import { JsonObject, JsonObjectFromString } from '../../json'

// Malformed optional facts are unknown, not invented defaults.
const count = z.number().int().nonnegative().nullable().catch(null)

const Metadata = JsonObjectFromString.pipe(
  z.object({
    context_length: count,
    data_policy: z
      .object({
        canPublish: flagOrNull,
        requiresUserIDs: flagOrNull,
        retainsPrompts: flagOrNull,
        retentionDays: count,
        training: flagOrNull,
      })
      .nullable()
      .catch(null),
    features: z
      .object({
        supports_native_web_search: flagOrNull,
      })
      .nullable()
      .catch(null),
    has_chat_completions: flagOrNull,
    has_completions: flagOrNull,
    is_deranked: flagOrNull,
    is_disabled: flagOrNull,
    is_zdr: flagOrNull,
    limit_rpd: count,
    limit_rpm: count,
    max_completion_tokens: count,
    max_prompt_tokens: count,
    max_tokens_per_image: count,
    moderation_required: flagOrNull,
    quantization: textOrNull,
    supported_parameters: stringsOrNull,
    supports_reasoning: flagOrNull,
  }),
)

type Facts = z.infer<typeof Metadata>

const Overrides = z.array(JsonObject)

function toDataPolicy(policy: Facts['data_policy']): Endpoint['data_policy'] {
  return {
    can_publish: policy?.canPublish ?? null,
    requires_user_ids: policy?.requiresUserIDs ?? null,
    retains_prompts: policy?.retainsPrompts ?? null,
    retention_days: policy?.retentionDays ?? null,
    training: policy?.training ?? null,
  }
}

// Upstream reasoning rates have been misleading across many endpoints.
const UNPUBLISHED_METERS = new Set(['internal_reasoning'])

function toPricing({ discount, meters, overrides_json }: CurrentEndpointRow['pricing']) {
  return {
    discount,
    meters: Object.fromEntries(
      Object.entries(meters).filter(
        ([meter, rate]) => !UNPUBLISHED_METERS.has(meter) && MeterRate.safeParse(rate).success,
      ),
    ),
    overrides: overrides_json === undefined ? null : Overrides.parse(JSON.parse(overrides_json)),
  }
}

/** Catalog row to V5 contract; unlisted endpoints carry no current readings. */
export function toEndpoint(
  row: CurrentEndpointRow,
  stats: CurrentStatsRow | undefined,
  providerName: string | undefined,
): Endpoint {
  const facts = Metadata.parse(row.metadata_json)
  const listedStats = row.unlisted_at === undefined ? stats : undefined

  return Endpoint.parse({
    context_length: facts.context_length,
    data_policy: toDataPolicy(facts.data_policy),
    has_chat_completions: facts.has_chat_completions,
    has_completions: facts.has_completions,
    id: row.endpoint_id,
    input_modalities: row.input_modalities,
    is_deranked: facts.is_deranked,
    is_disabled: facts.is_disabled,
    is_zdr: facts.is_zdr,
    label: row.provider_display_name,
    limit_rpd: facts.limit_rpd,
    limit_rpm: facts.limit_rpm,
    max_completion_tokens: facts.max_completion_tokens,
    max_prompt_tokens: facts.max_prompt_tokens,
    max_tokens_per_image: facts.max_tokens_per_image,
    model: {
      created_at: isoDate.parse(row.model_or_created_at),
      id: row.model_id,
      name: row.model_display_name,
      variant: row.variant,
    },
    moderation_required: facts.moderation_required,
    output_modalities: row.output_modalities,
    pricing: toPricing(row.pricing),
    // Endpoint labels vary within a provider; the provider entity holds its own name.
    provider: {
      id: row.provider_id,
      name: providerName ?? row.provider_display_name,
      tag: row.provider_tag,
    },
    quantization: facts.quantization,
    stats: {
      p50_latency_ms: listedStats?.p50_latency ?? null,
      p50_throughput_tps: listedStats?.p50_throughput ?? null,
    },
    supported_parameters: facts.supported_parameters,
    supports_native_web_search: facts.features?.supports_native_web_search ?? null,
    supports_reasoning: facts.supports_reasoning,
    unlisted_at: row.unlisted_at ?? null,
  })
}
