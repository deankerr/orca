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
- Always-null so far: `hf_updated_at`, `is_trainable_image`, `preview_thumbnail_url`, `router`.
  Always-false: `hidden`, `is_private` (public capture can't see hidden things).
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
- `status`: 0 normal; negatives observed (-2, -3, -5). Theory: a penalty consumed by the
  routing algorithm, manually controlled — don't infer semantics beyond that. Capture for
  potential insight; not for end-user communication.
- `features` (endpoint-level ≠ model-level!): 16 observed flags; only `supports_tool_choice`
  universal. ⚠️ boilerplate outside text modality (see below).
- `is_deranked`, `is_disabled`, `is_byok_only`, `capacity_tpm`, `deprecation_date`: sparse
  operational flags. ❓ churn rates unknown → diff analysis will classify signal vs noise.
- Endpoint fan-out is an LLM phenomenon: ~2.9 endpoints/scope for text vs ~1 elsewhere.

## Pricing (the deep end)

Five overlapping representations per endpoint; keep all, prune after diff analysis:

- `pricing` — normalized token-oriented view (prompt/completion/caching/web_search +
  `overrides` for context-threshold tiering). ⚠️ Outside text modality its values are mostly
  placeholder `"0"` — a lie. Embeds a byte-identical copy of `display_pricing` (drop it).
- `pricing_json` — SOURCE OF TRUTH. Adapter-namespaced SKU keys (`openai_responses:prompt_tokens`).
  ~75 distinct SKU names in text alone; per-modality unit families (cents_per_image_output,
  duration_seconds_*, characters, audio_minutes, search-units). ⚠️ naming is inconsistent
  (kebab `search-units`); ⚠️ values are decimal strings except krea's raw numbers.
- `display_pricing` — presentation view, but the only place exotic SKU semantics are labelled
  ("Image Output (moodboards)", tier breakdowns). `kind: token|unit` ≈ upstream's declaration
  of pricing family.
- `tiers` — flex/priority per-tier pricing variants (53 endpoints).
- `pricing_version_id` — opaque UUID. ❓ does it change iff pricing changes?
- Public API (`:free` of all this): renames `provider_slug` to `tag`, collapses pricing to the
  token view. Their docs barely acknowledge any of this.

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

## Capture / processing notes

- OR's API is Cloudflare-cached, heavy, and hammered by their own site — they don't notice or
  care about polling. No guarantee an observation exists at any given time.
- Layer 1 canonicalization lives in `packages/processes` (`bun run canonicalize`): strict zod
  parse of raw shapes (schema drift fails loudly), flat snake_case canonical entities
  (SQL-ready), one output file per entity per pass. `bun run split-modalities` slices raw
  scopes per modality for analysis.
- Philosophy: capture first, ask questions later. Carry upstream verbatim at Layer 1; mute
  noise at the diff point, not at ingestion. Don't code paths for exotic one-off SKUs.

## Open questions (rollup)

- ❓ `pricing_version_id` stability/semantics across passes (first diffs will answer)
- ❓ churn/signal classification of `default_order`, `updated_at`, `capacity_tpm`, `is_deranked`
- ❓ `model_version_group_id` semantics; `limit_*` zero semantics
- ❓ endpoint delete/recreate lineage: worth detecting heuristically in Layer 2?
- ❓ diff process must treat unobserved/errored scopes as stale, never as deletions
- ❓ archival back-catalogue (old bundle format) not yet mapped onto this model
