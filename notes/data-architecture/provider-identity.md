# Provider identity: three concepts flattened into strings

⚠️ **Read this before touching any `provider_*` field on an endpoint.** OpenRouter's provider
model looks denormalized but is not, and modeling it the "obvious" way (slug as FK, display
name as a provider attribute) is wrong in ways that only show up on the long tail. Everything
below is verified against the full deduped pass `2026-07-24T03:46:13.868Z` (1,052 endpoints,
102 provider records) — see `packages/processes/`.

## The three concepts

OpenRouter flattens three distinct things into overlapping string fields:

1. **The organization** — "Azure", "Amazon Bedrock". Has no record of its own anywhere in the
   API. Identified only by the display string `name` / `provider_name`.
2. **The provider record** (`provider_info`, deduped into our pass view's `providers`) — a
   reachable configuration of an organization: same-name records differ only in `slug`,
   `displayName`, and routing wiring (`baseUrl`, `adapterName`, `pricingStrategy`). 15 orgs
   have multiple records (`azure` + `azure/eu`; six `google-vertex/*`; five Bedrock; …).
   These "variants" exist to let users target them; they carry no provider facts of their own.
3. **The endpoint targeting key** (`provider_slug` on an endpoint) — may point at a base
   record (`azure`), a variant record (`azure/eu`), or _nothing at all_
   (`azure/swedencentral`, `novita/fp8` — ~100 such values, where the suffix is a region or
   quantization qualifier with no `provider_info` behind it). OR's public API exposes this
   same value renamed to just `tag` (their docs barely acknowledge the concept).

## The FK is `provider_name`. Yes, the display string.

It is the only join that never breaks: every endpoint's `provider_name` matches exactly one
group of provider records, no orphans. Slug prefixes are NOT a reliable alternative:

- `sambanova-turbo` is a SambaNova variant with no slash at all.
- `anthropic/claude-on-aws` is a provider record whose `name` is **"Amazon Bedrock"** — a slug
  under `anthropic/` belonging to a different organization. Any prefix-parse of slugs lies here.

Consequence: an upstream rename of `provider_name` forks the organization's identity. That is
a Layer 2 change-detection concern — and it is upstream's problem too, since it's their key.

## Endpoint `provider_*` fields are ENDPOINT properties

`provider_display_name`, `provider_model_id`, `provider_region`, and even `provider_slug` are
properties of the endpoint, not denormalized copies of provider fields — or at least the data
proves they aren't always:

- The same `provider_slug` appears with _different_ `provider_display_name`s on different
  endpoints: `amazon-bedrock/eu-west-1` shows up as both "Amazon Bedrock" and
  "Amazon Bedrock (EU)". Display name is a function of the endpoint, not the slug.
- ~100 `provider_slug` values resolve to no provider record at all (region/quantization
  qualifiers), so they cannot be a foreign key.
- `provider_model_id` is the provider's own model identifier for _this endpoint_
  (`gpt-5.4-2026-03-05` at OpenAI vs `gpt-5.4` at Azure).

They _refer_ to the provider, but they must be stored on the endpoint verbatim. (The raw
observation also embeds a full `provider_info` copy per endpoint; the pass view already strips
that — the deduped `providers` list is where provider records live.)

## Canonical modeling decision (current)

- `providers` table: one row per `provider_info` record, `slug` PK, 102 rows. Variant records
  stay as ordinary rows — they are what upstream gives us.
- The organization is a **derived grouping** (`GROUP BY name`), not a stored entity. Storing a
  table keyed by a display string would enshrine upstream's mistake; deriving it costs one
  query and stays correct if our understanding improves.
- Canonical endpoints keep `provider_name` (the org join), `provider_slug` (targeting key,
  verbatim — never decomposed), `provider_display_name`, `provider_region`, `provider_model_id`,
  and `quantization` as endpoint columns.
