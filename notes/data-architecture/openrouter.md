# OpenRouter's data model — a hitchhiker's guide

Field guide to the data behind OR's frontend API, as observed through our capture passes.
Succinct on purpose; deep-dives live in [provider-identity.md](provider-identity.md) and
[modality-split.md](modality-split.md). Figures from pass `2026-07-24T03:46:13.868Z`
(815 catalog models, 431 scopes, 1,052 endpoints, 102 provider records) unless noted.
Annotations: ❓ = open question, ⚠️ = landmine.

## Vocabulary

- **model** — the abstract thing ("openai/gpt-5.2"). `slug` is the current id, `permaslug` the
  versioned one (`openai/gpt-5.2-20251211`). They're equal on ~43% of models.
- **variant** — model flavor: `standard` (implied by bare slug), `free`, `thinking`. Variant
  slug = `slug:variant` for non-standard (`x/y:free`).
- **scope** — our term: one (model, variant) observation target = one stats/endpoint request.
- **endpoint** — a (model variant × provider config) offering, UUID `id`. The atom of pricing
  and capability. `id` is a stable, confirmed-globally-unique reference (the existing backend
  is built on this). ⚠️ Providers occasionally delete-and-recreate an endpoint under a new
  UUID (usually with some changes); an observer can deduce the lineage, but the id won't.
- **endpoint name** — `${provider_name} | ${model_variant_permaslug}` (fully derivable). The
  human-readable handle: OR never exposes endpoint UUIDs to end users and endpoints aren't
  end-user addressable, so names matter for any frontend/user-facing reference. ALMOST
  globally unique — one known historical collision.
- **provider** — three overlapping concepts flattened into strings; see
  [provider-identity.md](provider-identity.md). Org ("Azure") has no record and is keyed by
  display name; `provider_info` records are targetable configs (`azure`, `azure/eu`);
  endpoint `provider_slug` may match neither (`azure/swedencentral`, `novita/fp8`).
  ⚠️ The only reliable endpoint→provider join is `provider_name`.

## Catalog (`/api/frontend/v1/catalog/models`)

- Contains OR's ENTIRE model history — 815 entries, 374 with no endpoints (long-dead models:
  gpt-3.5-turbo-0125, claude-instant-1…). Reduce to `variant slug → has-endpoints boolean`.
- `~`-prefixed alias slugs (`~openai/gpt-latest`) are router pointers, not capturable models.
- A model with 0 endpoints 404s on the stats endpoint. ⚠️ 404 = "zero endpoints now", not error.

## Model records

- Embedded (identically, verified) in every endpoint observation of its variants; one record
  per base slug.
- ⚠️ `""` is used interchangeably with null: `hf_slug`, `warning_message`, `promotion_message`,
  `routing_error_message`.
- Always-null so far: `hf_updated_at`, `is_trainable_image`, `preview_audio`,
  `preview_thumbnail_url`, `router`.
  Always-false: `hidden`, `is_private` (public capture can't see hidden things).
- 📌 First observed schema drift of the new pipeline: `preview_audio` appeared between the
  2026-07-24 and 2026-07-25 passes. The strict parse caught it on the first re-run — exactly
  what "unknown key is a wanted signal" is for.
- `features.reasoning_config` duplicates top-level `reasoning_config` byte-for-byte;
  `features.chat_template_config` is the only content in `features`.
- `reasoning_config` is the richest capability object (efforts, tokens, mandatory-ness,
  return mechanism); 10 keys, presence varies. Only-true-or-null: `is_trainable_text`.
- `default_order` = OR's provider routing preference (provider_info slugs) — config, not fact,
  but changes are Monitor-worthy.
- `model_version_group_id` on 33 models only. ❓ semantics (links permaslug generations?).
- `limit_rpm`/`limit_rpd` on 98 models, values include 0. ❓ meaning of 0 (disabled? unlimited?).

## Endpoints

- ⚠️ `provider_display_name`, `provider_model_id`, `provider_region`, `provider_slug` are
  ENDPOINT properties, not denormalized provider fields (same slug ↔ different display names).
- `name` fully derivable: `${provider_name} | ${model_variant_permaslug}` (1052/1052).
- Raw observations embed full copies of the model and provider_info in EVERY endpoint, with
  insignificant copy-to-copy differences — dedupe before any analysis (worker pass view does).
- `variant` always equals the scope's variant. `limit_rpm_cf` always null.
- ⚠️ `status` looks like an endpoint field but behaves like telemetry — see below.
- `features` (endpoint-level ≠ model-level!): 16 observed flags; only `supports_tool_choice`
  universal. ⚠️ boilerplate outside text modality (see below).
- `is_deranked`, `is_disabled`, `is_byok_only`, `capacity_tpm`, `deprecation_date`: sparse
  operational flags. ❓ churn rates unknown → diff analysis will classify signal vs noise.
- Endpoint fan-out is an LLM phenomenon: ~2.9 endpoints/scope for text vs ~1 elsewhere.

## Pricing (the deep end)

Five overlapping representations per endpoint; keep all, prune after diff analysis:

- `pricing` — normalized per-unit view (prompt/completion/caching/web_search + `overrides` for
  context-threshold tiering). ⚠️ Outside text modality its _token_ fields are placeholder `"0"` — a
  lie — but its modality-specific fields are the only real numbers upstream gives you; see below.
  Embeds a byte-identical copy of `display_pricing` (drop it).
- `pricing_json` — SOURCE OF TRUTH. Adapter-namespaced SKU keys (`openai_responses:prompt_tokens`).
  ~75 distinct SKU names in text alone; per-modality unit families (cents_per_image_output,
  duration_seconds_*, characters, audio_minutes, search-units). ⚠️ naming is inconsistent
  (kebab `search-units`); ⚠️ values are authored notation, not normalized numbers — see below.
- `display_pricing` — presentation view, but the only place exotic SKU semantics are labelled
  ("Image Output (moodboards)", tier breakdowns). `kind: token|unit` ≈ upstream's declaration
  of pricing family.
- `tiers` — flex/priority per-tier pricing variants (53 endpoints).
- `pricing_version_id` — opaque UUID. Measured a strict _superset_ of price change over 39
  transitions: 13 moves, 10 alongside a real SKU change, 3 with none, 0 real changes missed. A
  usable cheap detector, an unusable change record.
- Public API (`:free` of all this): renames `provider_slug` to `tag`, collapses pricing to the
  token view. Their docs barely acknowledge any of this.

Three findings from diffing all five across 40 consecutive passes (`bun run pricing-changes`,
`pricing-examples` in `packages/processes`). Each one cost a wrong turn:

- 📌 **`pricing` is COMPUTED, and `discount` is the only thing moving.** Every value equals a
  `pricing_json` SKU × `(1 - discount)` — exact on 95/95 discounted endpoints. `tiers` = base ×
  `<tier>_tier_multiplier`; `pricing.overrides` = the `*_long_context` SKUs + `long_context_threshold`.
  All of it derived, all from `pricing_json`. ⚠️ So apparent price churn is one scalar: `discount`
  moved three `pricing` keys and every `display_pricing` row on 15 endpoints across 33/39
  transitions while list prices sat still. Cause is two providers undercutting each other on one
  model (glm-5.2) in sub-cent steps — a per-token base unit makes that possible. It flaps rather
  than trends (travelled 14× net) but it is real money: ~18¢/MTOK of movement, 1.3¢ net, in 10h.
  ⚠️ Real repricings are the opposite shape — low-frequency, high-amplitude (one was $3.00 → $2.10),
  so the two separate by _amplitude_, not by field or by provider.
- ⚠️ **…and yet `pricing` cannot be dropped — some keys exist nowhere else.** `web_search` on 71
  endpoints matches no SKU at any discount and takes one of four apparently hand-keyed values
  (0.014, 0.01, 0.005, 0.0025): OR's own web-search add-on, not the provider's. `image_token` /
  `image_output` are unit conversions at factors absent from the data ($/megapixel ÷ 4096, on the one
  endpoint whose SKU names let it be checked). `input_cache_write` = `cache_write_storage_hours` ÷ 12
  (33/33). ⚠️ Its repeating decimals (`0.00000008333333333333334`) are real rationals, not float
  noise — deriving these ourselves means reproducing OR's arithmetic exactly. Don't drop a view
  because it looks redundant; check every key.
- ⚠️ **`pricing_json` is neither purely prices nor normalized numbers.** It also carries
  `long_context_threshold` (a token count), `*_tier_multiplier` (ratios), `upstream_cost_cents`
  (OR's own cost, leaked) and `informational_*` fields that are nonetheless the rate shown to users.
  Values arrive in whatever notation was authored — `"0.25e-6"`, `".03e-6"`, raw `3e-7`, mixed
  inside one object — so ⚠️ 48% of price rows differ from a canonical rendering. Comparing the text
  records a re-authoring as a price change: compare parsed numbers, keep the string as provenance.

## Data policy

- Endpoint `data_policy` is authoritative for behaviour (training, retainsPrompts,
  retentionDays…); endpoints override provider policy, so ⚠️ provider-level behavioural claims
  are never trustworthy ("provider X doesn't retain prompts" cannot be asserted).
- Policy document URLs (ToS, privacy) ARE provider-stable (verified: 0 mismatches) — they live
  on the provider entity.
- Divergence between endpoint and provider policy is mostly key-presence noise; real value
  overrides are rare (~25 endpoints) and meaningful.

## The modality split

- OR forces non-LLM offerings through the LLM pipeline; >25% of scopes are non-text
  (image 29, embeddings 27, video 17, speech 15, transcription 12, rerank 4, hybrids 13).
  Group key: `model.output_modalities` joined with `_`. See [modality-split.md](modality-split.md).
- ⚠️ LLM-shaped fields are stamped on everything: embeddings "support" temperature; rerank
  gets `supports_tool_choice`. Capability fields only mean something within a modality group.
- Genuinely modality-specific: `supported_image_parameters`, `supported_video_parameters`
  (⚠️ also non-null on text endpoints with a different meaning), `supported_tts_voices`
  (model-level, speech only), `allowed_passthrough_parameters` (image/video styling).

## Telemetry (separate pipeline, not Layer 1)

- `stats`, `statsByTier`, `status_heuristics{,_5m,_1d}`, `routing_heuristics_by_tier` — ~23% of
  endpoint bytes, changes every pass. `statsByTier.default` ≈ `stats` but computed at a
  slightly different instant (off-by-a-few request counts) — never diff them against each other.
- 131 endpoints had no stats at all (no recent traffic).
- `status`: 0 normal; negatives observed (-2, -3, -5). A penalty consumed by the routing
  algorithm. ⚠️ It sits on the endpoint record but belongs here: it flips on 25–50 endpoints
  _every pass_, so stored as an entity field it dominates change volume and buries every real
  capability change beside it. Treat it as a series, not a fact about the offering. Don't infer
  semantics beyond "OpenRouter is currently derating this endpoint", and don't surface a reading
  we can't justify. ❓ Whether it correlates with `status_heuristics_*` is worth answering — if it
  tracks health, it's a candidate product signal rather than only noise to route away.

## Capture / processing notes

- OR's API is Cloudflare-cached, heavy, and hammered by their own site — they don't notice or
  care about polling.
- No guarantee an observation exists at any given time.
- ⚠️ **The cache windows are wider than our polling interval, and there are no `etag` or
  `last-modified` headers on any response — conditional requests are impossible.**
  `stats/endpoint` is `max-age=300, stale-while-revalidate=600`, so one generation can be served
  for 900s — our entire 15-minute interval. The catalog is `s-maxage=300, swr=300` (600s). Observed
  live: `age: 696` on a `cf-cache-status: UPDATING` response, i.e. data 11.6 minutes old, served
  stale while Cloudflare refreshed behind it. 📌 **So every change count is a count of
  _observations_, not of events**: two consecutive passes can return the same generation and carry
  no information, and a real change can hide for a full pass. `date - age` is the only way to know
  when data was actually generated, which is why capture records response headers (added
  2026-07-26; passes before that can never be corrected). ⚠️ Cache state is per-edge and
  popularity-dependent — probing from a laptop says nothing about what the Worker's colo sees, and
  the 5-minute `max-age` is a floor on useful cadence for a warm scope. Cache-busting with a nonce
  would get fresher data and is deliberately not done: hitting their CDN is why nobody minds us.
- Philosophy: capture first, ask questions later. Carry upstream verbatim; mute noise at the diff
  point, not at ingestion. Don't code paths for exotic one-off SKUs.

## Open questions (rollup)

- ❓ why does `discount` drift at all — a fixed provider price pegged to a moving reference?
- ❓ churn of `default_order`, `updated_at`, `capacity_tpm`, `is_deranked`, `is_disabled`,
  `deprecation_date`: all measured completely static over 40 passes — but that window held no model
  launch, so it says "stable between launches", not "stable"
- ❓ `model_version_group_id` semantics; `limit_*` zero semantics
- ❓ endpoint delete/recreate lineage: worth detecting heuristically in Layer 2?
- ❓ diff process must treat unobserved/errored scopes as stale, never as deletions
- ❓ archival back-catalogue (old bundle format) not yet mapped onto this model
