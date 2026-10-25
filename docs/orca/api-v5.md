# Public API V5

V5 is the development name for ORCA's next public data API. It carries no stability promise or public name yet.
This document records goals, curation principles, working decisions, and open questions;
experiments establish the implementation.

V5 has three parts. The Contract defines what ORCA publishes about models, endpoints, and providers.
Listings answer what is offered now; Events answer what changed. Both present the Contract.

## Goals

- Define ORCA's canonical shared data representation, to which every product eventually normalizes.
- Build the foundation for future iterations of the grid and alerts, as well as the API itself.
- Cover at least the data behind current web views, with real query parameters rather than whole-catalog dumps.
- Make ORCA usable by agents as well as people: machine-readable schema, generated reference docs, and MCP.
- Define schemas once in Zod and derive validation, OpenAPI, reference docs, and MCP tool inputs from them.
- Welcome usage from the start: mostly static JSON must be cheap enough to serve that callers need no rate limit.

## Curation

Publishing is curation. The Catalog retains upstream facts broadly; the Contract is a deliberate selection.
The most important curation decision is often what not to publish.

- Judge each fact from the end user's perspective: would it change a decision about which endpoint to use?
- Publish a fact only when ORCA can explain it. Instinct is a legitimate input when evidence is thin.
- A value that cannot be explained cannot inform a decision, however complete its coverage.
- Raw endpoint `status` is the standing example: its negative codes are undocumented, so ORCA does not publish it.
- Remove a field when upstream stops supplying it. Stale values on unlisted records are not a reason to keep it.
- Ask what products should render now, given current knowledge of the data.
- The Contract may lead products: the grid needs a visual rendition per attribute and visual balance, so it catches up.
- Present the source's meaning, not ORCA's guess: unknown is not false, and reported assertions are not behavior.

Confidence comes from observing the output in place over time, not from a contract or its data alone.
Any stability guarantee sits behind that process and is a personal commitment by ORCA's maintainer.

`docs/openrouter/` marks fields ORCA has decided never to publish with 🚫, and fields not published for now with 💤.

## Delivery

V5 makes no Contract stability commitment until a complete working version exists. Stability constrains
design thinking and binds ORCA to choices made before it knows what it is building, so fields, names,
and shapes change freely until then.

- First launch V5 as an unpublicised alpha consumed by ORCA's own agents, for the most direct feedback.
- Projection upgrades made for V5 may be backported to the grid and alerts in their existing form.
- GitHub stacked pull requests can separate those backports from the API itself.

## Contract

### Representation

- The Contract is independent of any serving surface, so web, API, MCP, and Discord can share it.
- Contract schemas are pure Zod with descriptive metadata and no Convex imports.
- Values stay faithful to upstream representations, such as decimal-string per-token prices, pending experiments.
- Every Contract field is present; `null` means unknown, and field names carry units where units apply.
- Names follow `GLOSSARY.md`; field renames and newly curated fields are expected relative to existing products.
- Model IDs appear verbatim, including any `:variant` suffix, matching OpenRouter's own API.

### Values

- Publish frontend values as observed; never substitute public-API derivations such as filled output limits.
- `max_completion_tokens` stays null when upstream reports null.
- Map deprecation dates after 2049 to null; OpenRouter uses far-future dates as placeholders.
- Map empty and whitespace-only prose and message strings to null.
- Model `description` is never null: upstream has always supplied a substantive description.
- Publish the upstream `quantization` string `unknown` as is: OpenRouter reports a known unknown, unlike null.

### Fields never published

- Raw `status`, as above.
- Uptime, which ORCA considers unreliable; it ignores rate limits, provider 400s, garbled output, and tool failures.
- `routing_error_message`: most messages describe a retired `:free` sibling but appear on the paid model.
- `promotion_message`, which is OpenRouter promotional copy.
- `features.supported_parameters` and other `features.*` values whose user-facing meaning is unestablished.
- File, video, and audio input-form flags, which may describe OpenRouter's delivery to providers.
- `is_hidden` and `is_private`: ORCA observes only public offerings.
- `excluded_parameters`, `default_order`, `model_version_group_id`, and `group`, which carry no end-user value.
- `capacity_tpm`, a volatile provider-side traffic allowance or limit rather than an endpoint property.
- Adapter names, base URLs, pricing strategies, icons, and other OpenRouter-internal wiring.

Flags that have only ever been null or false in ORCA's scope, such as `is_hipaa_eligible`, are not published for now.
They may represent planned, abandoned, or enterprise-only features, and ORCA does not serve enterprises.

### Pricing

ORCA takes an opinionated view of pricing. `pricing.*` meters, `discount`, and `overrides` carry the quote.

- `internal_reasoning` is never published; its values have been misleading across many endpoints.
- `pricing_json`, `display_pricing`, and `pricing_version_id` are internal representations and are not published.

### Variants and tiers

- `:batch` is a variant like any other. It is not a service tier, and ORCA has no reason so far to treat it differently.
- Service tiers are separate endpoints identified by `service_tier`; tier pricing and stats belong to those endpoints.

### Shared semantics

Several product meanings exist only in web client code today. V5 resources need the same meanings,
so they move into shared code rather than being reimplemented:

- Slug search over model slugs and provider tags.
- Pricing-history interpretation of membership spans and quote continuity.
- Model reasoning interpretation.

The grid's boolean "attributes" and their `has`/`not` facets are not part of V5 pending a rethink of that concept.
Its predicates treat unknown as a non-match, so `not` includes unknowns and cannot promise a known negative.

### Curation candidates

Proposals that follow from upstream observations; they are not accepted policy.

- Deprecation dates: past dates almost always preceded removal, although dates can move later.
- BYOK-only endpoints, which cannot be used with OpenRouter credits.
- Tool-choice modes only where `tools` is supported; elsewhere all four modes are boilerplate.
- Forced tool choice matters to agents and is missing on many tool-capable endpoints.
- Endpoint `service_tier`, kept separate from provider-facing labels and tag suffixes.
- Mandatory reasoning at endpoint level where present, since it can differ from the model.
- Reasoning configuration with default enabled state, effort, and token-budget support.
- Stats history's percentile ladder, windows, and request counts beside p50 values.
- Conditional pricing: context-length thresholds and UTC schedules from `overrides`.

Some candidates need their meanings checked first:

- Endpoint `created_at`, `provider_model_id`, and `provider_region`.
- Region labels mix broad areas and cloud regions and do not establish residency.
- Model `default_parameters` and `warning_message` carry provider guidance.
- Warnings include data-logging terms for free endpoints, which are relevant to data policy.

Represent effort selection explicitly: unknown, unavailable, unrestricted, or enumerated. Preserve
upstream effort ordering when it drives a selector. Keep provider names separate from endpoint
labels, and keep endpoint data policy authoritative; provider defaults cannot fill unknown policy facts.
A positive cache meter is evidence of a published charge, not proof of cache behavior; zero-priced
caching must remain representable.

Performance values need the reading's scan time, per-metric window and request count, tier, and metric
identity. Retained Stats history has broader samples than Current stats, which reduces them to default-tier
medians. Missing stats do not establish downtime.

The public API can supply native-tool mappings and implicit-cache assertions. Collect it alongside
frontend scans with its own capture time, authentication context, and coverage. Keep the frontend
UUID as endpoint identity; public model/tag matches are candidate associations because tags can be
shared or changed. Preserve ambiguous and unmatched associations instead of choosing a row.
Authenticated telemetry must represent a declared shared scope before publication through an anonymous API.
Republishing implicit caching would also need an explanation of the public value's meaning.

## Listings

Listings present what OpenRouter currently offers, in Contract shape at the ORCA clock. Endpoints are the
listings; models and providers are the known entities those listings belong to, like makes and models on a
car-sales site. A model with nothing listed is still a known model, so ORCA keeps referring to it.

- Endpoint lists contain only listed endpoints by default, so callers can make decisions and render UIs directly.
- `status=unlisted` or `status=all` opts into recently unlisted endpoints, within the grid's 30-day window.
- Getting one endpoint by ID also returns a windowed unlisted endpoint, with `unlisted_at` set.
- Model and provider lists include every known entity; `listed_endpoints` is zero while nothing is listed.
- `has_listings=true` or `false` selects models or providers with or without a listed endpoint.
- Known models and providers remain addressable by ID, and their endpoint lists are empty rather than missing.
- Responses state the ORCA clock as `as_at`: hourly scans mean upstream can have changed up to an hour since.
- Joins happen within one Convex query, so one response reads one consistent Catalog state.
- Independently advanced projection horizons are not equal; derive readiness or publish a separate stats horizon.
- The catalog is small enough to filter, sort, and page in memory over a cached complete canonical set.

🔭 2026-10-14 prod: the current stats snapshot held 1,253 endpoint rows, indicating the scale of in-memory filtering.

| Web view       | Resource scope                                                              |
| -------------- | --------------------------------------------------------------------------- |
| Endpoints grid | Endpoint list with search, model/provider, numeric bounds, status, and sort |
| Overviews      | Single model, provider, and endpoint, plus a model's endpoints              |
| None           | ORCA clock and readiness                                                    |

## Events

Events present what changed, in Contract shape. Lifecycle facts such as an endpoint's unlisting belong here
rather than in default endpoint listings. V5 events supersede the experimental feed once they
cover its scopes.

Existing infrastructure, described in `events.md` and `feed.md`, already supplies most of this:

- Retained Events record ADD, UPDATE, and REMOVE per entity and scan pair, with identity context.
- Shared alert interpretation adds lifecycle meaning, prior knowledge, field selection, and pricing eligibility.
- Activity scopes select one entity, or a model or provider with its endpoints, using captured relationships.
- Cursor pagination merges Events and observations, capped at completed ingestion.

Retained Events were designed for storage: one row per entity and scan pair, upstream field paths, and
json-diff-ts trees. V5 events are a projection of them into Contract shape, not a redacted copy.

Working shape, pending a spike:

- One event per entity change: its kind, ID, scan time, and type, such as listed, unlisted, or updated.
- Lifecycle events carry the complete Contract entity; updates carry field changes in Contract field paths.
- The same Contract curation applies, so a change to an unpublished field produces no event.
- Responses state `as_at` as completed ingestion, and continuation follows the feed's cursor semantics.

The first projection reads Retained Events directly because it is simple. Like Discord alerts, events
will likely gain a secondary curated layer that gives ORCA's interpretation decisions stability.

Updates are partial entities, so the Contract translates partial shapes as well as complete ones. Each
endpoint Contract field declares the catalog entity paths it reads and its value mapping. Current rows,
Event snapshots, and Event diffs share the catalog entity shape, so one declaration set serves Listings
and Events. A changed path that no field reads is curated out, and a change whose mapped sides are equal
produces nothing. A field that a change touches without supplying its complete sides is unresolved; an
Event's complete pricing quotes resolve `pricing`. String-set fields translate as added and removed members.

The 2026-10-25 spike, `v5-events-spike` in `packages/scripts`, ran on the worktree deployment's data:

- The declarations reproduced all 1,560 snapshot endpoints exactly and projected all 124 lifecycle snapshots.
- Of the latest 4,827 endpoint UPDATEs, 1,879 translated and 2,948 had no Contract change; none was unresolved.
- `pricing` changed in 1,787; most no-change updates were `derived_service_tier`, `capacity_tpm`, or display pricing.
- Pricing changes carry whole before and after quotes, which consumers must diff to find the changed meter.

Models and providers, and context fields such as provider names, stats, and listing counts, are not yet declared.

Pricing and stats histories are time series rather than events, but answer the same "over time" question:

| Web view | Resource scope                                                      |
| -------- | ------------------------------------------------------------------- |
| Monitor  | Events by entity, model, or provider scope with cursor continuation |
| Pricing  | A model's pricing history                                           |
| Stats    | An endpoint's stats history                                         |

## Serving

- Convex queries transform Catalog rows into Contract shapes.
- A service layer of plain functions answers parameterized requests; REST and MCP are adapters over it.
- REST uses Hono with `@hono/zod-openapi`, publishing OpenAPI and Scalar reference docs.
- The Hono app lives in its own package and is first mounted in a Next.js route handler on Vercel.
- Next.js gives the same origin, deploy pipeline, and branch previews; portability keeps a later move to Workers cheap.
- Access is anonymous with no rate limiting; scaling relies on CDN caching keyed to the ORCA clock.
- MCP exposes a few task-shaped tools sharing Contract inputs and service functions, not one tool per route.
- Frozen V2 remains an independent compatibility adapter; V5 does not change it.

## Open questions

### Contract

- Which representations should experiments test, such as per-million-token prices beside upstream values?
- What replaces boolean attributes for selecting capabilities, and how does it distinguish known false from unknown?
- Should provider-facing `derived_service_tier` labels be published beside `service_tier`?
- Do `can_abort` or `allowed_passthrough_parameters` change any user decision?
- Which `features.*` flags, such as native web search, apply patch, and web fetch, can ORCA explain to users?
- How should the grid render deprecation dates and tool-choice support?
- What observation period and maturity justify a public name and a stability promise?

### Listings

- How should cache lifetimes follow hourly scans and ingestion without serving a stale clock for long?
- Should the web app consume V5 over HTTP, or keep Convex subscriptions over the same canonical shapes?

### Events

- Should events follow alert selection and pricing eligibility, or every Contract-visible change?
- How should observation-only lifecycle alerts and prior-knowledge classification appear?
- Does a Contract entity in a lifecycle event describe the scan's facts, which can predate current curation?
- Should record-valued fields such as `pricing.meters` translate per key rather than as whole values?
- How should multi-source fields resolve when an Event supplies no complete sides for them?
- Which histories need pagination, given pricing history's complete per-model reads and stats history's larger scale?
