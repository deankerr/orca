# Providers

OpenRouter's provider fields flatten three distinct concepts. Their similar names obscure
important differences.

🧭 Providers are a low priority for ORCA. The catalog scan captures what the API exposes; deeper
provider enrichment is intentionally out of scope for now.

## Organization

The organization is the operator users recognize, such as `Azure` or `Amazon Bedrock`. It is
identified by the `name` field on every `provider_info` record.

- `provider_info.name` is the organization key: it is constant across an organization's records
  and stable over the observed corpus. An upstream rename still appears as a change of identity.
- Endpoint `provider_name` carries the same value: it agreed with the owning record's `name` on
  every endpoint in the corpus below.
- 📊 Observed 2026-08-28 (105 provider records from 789 text→text models): 105 records collapsed
  to 73 organizations; 18 organizations had multiple records, including Google, Amazon Bedrock,
  Fireworks, and DeepInfra.
- Provider slug prefixes cannot recover the organization: `sambanova-turbo` is a full record slug
  with no slash-delimited suffix.

## Provider record

The embedded `provider_info` object describes a targetable provider configuration. One
organization can have multiple records, such as `azure` and `azure/eu`.

- Same-organization records differ in `slug`, `displayName`, `baseUrl`, `adapterName`, and
  `pricingStrategy`. These records are useful routing targets, but should not be mistaken for
  separate provider organizations.
- Real differences between same-organization records are infrastructure-level: Azure's regional
  records carry distinct `baseUrl`s, and `pricingStrategy`/`adapterName` switch with the API
  surface being served.
- ⚠️ Data policy fields are identical within an organization, even when the slug implies
  otherwise: `xai/zdr` and `mistral/zdr` both declare `retainsPrompts: true` with
  `retentionDays: 30` despite a zero-data-retention label. Tagged records are serving variants,
  not separately modeled compliance tiers.
- ⚠️ `displayName` is not a grouping key: `google-vertex/us` and `google-vertex/us-east5` share
  "Google Vertex (US)", and `deepinfra` and `deepinfra/base` are indistinguishable by both `name`
  and `displayName`.

## Endpoint targeting key

Endpoint `provider_slug` identifies a targetable configuration or endpoint grouping. OpenRouter's
end-user API exposes the same concept as `tag`.

🧭 Treat tag suffixes as opaque. They see heavy churn and are frequently misleading: the
associated record's metadata often does not line up with what the tag implies, so no parsing or
decomposition rule should be built on them.

- Suffixes denote region, quantization, speed tier, compliance, or occasionally something else
  entirely, with no central registry.
- `amazon-bedrock/claude-on-aws` was a real tag on now-unavailable endpoints: a model name inside
  a provider tag.
- A tag relates to provider records in one of three ways: an exact record match (`azure/us`), a
  base-record match for quantization-suffixed tags (`deepinfra/fp8` → `deepinfra`), or no record
  at all (`azure/swedencentral`, `novita/fp8`).
- ⚠️ The same tag can resolve to different records per endpoint with no model-family pattern:
  `google-vertex/global`, `google-vertex/us-east5`, and `amazon-bedrock/us-east-1` each resolved
  to both a tagged record and the base record in the same corpus.
- 📊 Observed 2026-08-28 (186 distinct tags over 1,146 endpoints): 75 tags matched a record
  exactly; 111 had no record, of which roughly 99 were quantization suffixes and the rest
  region/speed tags such as `azure/global`, `mistral/eu`, and `openai/flex`.
- ❓ ORCA has not decided whether to key its provider entity on the record slug or the
  organization. Record slugs fragment hyperscalers across up to six rows; `name` collapses them
  at the cost of hiding genuine per-record routing targets.

## Endpoint-local provider metadata

`provider_display_name`, `provider_model_id`, `provider_region`, and `provider_slug` are endpoint
properties. `provider_model_id` is specifically the upstream provider's identifier for that
endpoint's model.
