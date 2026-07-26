// oxlint-disable sort-keys -- fields are grouped by what they are and stored in declaration
// order; alphabetising would scatter the groupings that carry the lane decisions.

// * The provider. ⚠️ Read notes/data-architecture/provider-identity.md before touching anything
// * here: upstream flattens three overlapping concepts into strings. The org ("Azure") has no
// * record at all; a `provider_info` record is a *targetable config* (`azure`, `azure/eu`); and an
// * endpoint's `provider_slug` may match neither (`azure/swedencentral`). This table holds the
// * middle one — the records upstream actually ships.
// *
// * ⚠️ Only the facts we are prepared to claim about a provider live here. The behavioural policy
// * fields (training, retains_prompts, retention_days) are deliberately absent: endpoints override
// * them, so "provider X doesn't retain prompts" is never a truthful claim, and storing it as a
// * provider column is how that claim gets made by accident. The policy *document* URLs are
// * provider-stable (verified, 0 mismatches) and do belong here.
// *
// * Measured over 40 consecutive passes / 39 transitions: **not one provider field moved**, and
// * no provider was born or died. Durable lane holds everything.
import * as Schema from 'effect/Schema'

import { Bit, Json, bit, columnsOf, list } from './lanes.ts'
import type { Lane } from './lanes.ts'

// * ── canonical input ───────────────────────────────────────────────────────────────────────
export const Provider = Schema.Struct({
  slug: Schema.String,
  // * ⚠️ the only reliable endpoint → provider join. Upstream's `provider_slug` on an endpoint
  // * frequently matches no provider record, so `name` carries the relationship and its
  // * uniqueness is a load-bearing invariant, not a coincidence.
  name: Schema.String,
  display_name: Schema.String,
  headquarters: Schema.NullOr(Schema.String),
  datacenters: Schema.Array(Schema.String),
  icon_url: Schema.String,

  byok_enabled: Schema.Boolean,
  has_chat_completions: Schema.Boolean,
  has_completions: Schema.Boolean,
  is_abortable: Schema.Boolean,
  moderation_required: Schema.Boolean,
  send_client_ip: Schema.Boolean,
  pricing_strategy: Schema.String,

  status_page_url: Schema.NullOr(Schema.String),
  privacy_policy_url: Schema.NullOr(Schema.String),
  terms_of_service_url: Schema.NullOr(Schema.String),
})
export type Provider = Schema.Schema.Type<typeof Provider>

// * ── durable lane ──────────────────────────────────────────────────────────────────────────
export const ProviderVersionRow = Schema.Struct({
  slug: Schema.String,
  name: Schema.String,
  display_name: Schema.String,
  headquarters: Schema.NullOr(Schema.String),
  datacenters: Json,
  icon_url: Schema.String,

  byok_enabled: Bit,
  has_chat_completions: Bit,
  has_completions: Bit,
  is_abortable: Bit,
  moderation_required: Bit,
  send_client_ip: Bit,
  pricing_strategy: Schema.String,

  status_page_url: Schema.NullOr(Schema.String),
  privacy_policy_url: Schema.NullOr(Schema.String),
  terms_of_service_url: Schema.NullOr(Schema.String),
})
export type ProviderVersionRow = Schema.Schema.Type<typeof ProviderVersionRow>

export const PROVIDER_VERSIONS: Lane = {
  table: 'provider_versions',
  kind: 'versions',
  keys: ['slug'],
  columns: columnsOf(ProviderVersionRow),
  // * deduped globally across the pass — the same provider_info is embedded in every endpoint it
  // * serves — so no per-scope evidence exists and close-out has to be conservative
  closeOut: { on: 'pass' },
}

export const toProviderVersion = (provider: Provider): ProviderVersionRow => ({
  slug: provider.slug,
  name: provider.name,
  display_name: provider.display_name,
  headquarters: provider.headquarters,
  datacenters: list(provider.datacenters),
  icon_url: provider.icon_url,

  byok_enabled: bit(provider.byok_enabled),
  has_chat_completions: bit(provider.has_chat_completions),
  has_completions: bit(provider.has_completions),
  is_abortable: bit(provider.is_abortable),
  moderation_required: bit(provider.moderation_required),
  send_client_ip: bit(provider.send_client_ip),
  pricing_strategy: provider.pricing_strategy,

  status_page_url: provider.status_page_url,
  privacy_policy_url: provider.privacy_policy_url,
  terms_of_service_url: provider.terms_of_service_url,
})

// * ── series lane ───────────────────────────────────────────────────────────────────────────
// * Empty today, and present for the same reason as the model one: rerouting a field that starts
// * flapping must be a config change, which requires the destination to already exist.
export const ProviderSeriesRow = Schema.Struct({
  slug: Schema.String,
  field: Schema.String,
  value: Schema.String,
  value_num: Schema.NullOr(Schema.Number),
})
export type ProviderSeriesRow = Schema.Schema.Type<typeof ProviderSeriesRow>

export const PROVIDER_SERIES: Lane = {
  table: 'provider_series',
  kind: 'series',
  keys: ['slug', 'field'],
  columns: columnsOf(ProviderSeriesRow),
  closeOut: { on: 'never' },
}

export const PROVIDER_SERIES_FIELDS: ReadonlyArray<{
  readonly field: string
  readonly read: (provider: Provider) => string | number
}> = []

export const toProviderSeries = (provider: Provider): ProviderSeriesRow[] =>
  PROVIDER_SERIES_FIELDS.map(({ field, read }) => {
    const value = read(provider)
    return {
      slug: provider.slug,
      field,
      value: String(value),
      value_num: typeof value === 'number' ? value : null,
    }
  })
