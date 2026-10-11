# Catalog projection implementation plan

## Authority and scope

This plan implements the language of `GLOSSARY.md`. For this restructure, its architectural
direction takes precedence over conflicting descriptions in `docs/orca/`. The glossary defines
the concepts; this document proposes their implementation. Existing code, table names, and
documentation describe the starting point rather than constraints on the target design.

Implementation will regenerate the affected Catalog representations from retained scans.
There is no migration of existing Catalog rows into the new tables. Collectors and Objects
remain unchanged. Scan continues to bridge collection and ingestion, with its responsibilities
adjusted as described below. This rewrite retains the existing ingestion orchestration,
including scheduling, acceptance, recovery, and observation-clock behavior. Advanced orchestration
is deferred to potential next steps. The public API's frozen contract and independent capture-based
path remain intact.

The responsibility split and projection semantics are the intended direction. Table names and
file layout below are concrete proposals. Questions identified for focused sessions must be
resolved where they affect an implementation; this plan does not prescribe their answers.

## Shifts in responsibility

Catalog encompasses current views and cumulative histories, including Events. A table's
membership in Catalog does not give any one product ownership of it. Current view is a
replaceable materialized view with its own metadata selection, rather than the definition of
Catalog or the source from which all other projections must be derived.

Ingestion owns the production of Catalog knowledge: extraction, projection, retention,
and progress. Future backfill and reprojection capabilities also belong here. Products own
interpretation, presentation, delivery, and any product-specific retained state. Neither side calls the other to access Catalog data;
both depend on shared definitions and use `ctx.db` directly where appropriate.

The shared interface includes validators, identities, and the meaning of retained facts.
For example, Listing state continues, a price quote replaces a complete quote, and a stats
reading does not carry forward. Shared pure helpers can embody these meanings. A generic
repository or a wrapper around every table read is unnecessary.

Coordination belongs to ingestion, but pure projections remain independent modules. The existing
runner composes them while retaining its transaction boundaries and progress tracking. Separating
responsibilities does not require replacing that orchestration in this rewrite.

## Proposed layout

Paths are relative to `packages/backend/convex/`. The tree shows responsibilities, not a
requirement to create every named file immediately. Tests stay beside the behavior they test.

```text
collectors/                       existing collection modules, unchanged
objects/                          existing source storage module, unchanged
scan/
  access.ts                       named interface for stored scans
  collected.ts                    collected record definitions
  reader.ts                       capture discovery, decoding, exact scan/pair loading
catalog/
  entities.ts                     shared entity and identity-context definitions
  pricing.ts                      shared quote definitions and field semantics
  time.ts                         shared observation-time helpers, where needed
  tables/
    current.ts                    current entity and stats table definitions
    listings.ts                   Listing history definition
    pricing.ts                    Pricing history definition
    stats.ts                      Stats history definition
    events.ts                     Events definition
    observations.ts               historical entity knowledge, if separately retained
    inputs.ts                     existing ingestion-record definitions
    progress.ts                   existing processor-work definitions
ingestion/
  run.ts                          forward orchestration and scheduling
  inputs.ts                       existing input selection
  extraction/
    observations.ts               pure assembly of scoped entity observations
    providers.ts                  provider identity and representative selection
  projections/
    current.ts                    current entity projection and metadata selection
    listings.ts                   pure scan-pair projection
    pricing.ts                    pure scan-pair projection
    stats.ts                      current/history projections of scan readings
    events.ts                     pure scan-pair projection
  retention/
    current.ts                    current-view writes
    listings.ts                   retained Listing output
    pricing.ts                    retained Pricing output
    stats.ts                      retained readings and current stats
    events.ts                     retained Event output and completion
  baseline.ts                     initial state composition
  progress.ts                     existing completion and recovery operations
products/
  grid/                           product queries and interpretation
  entity_overview/                product queries and interpretation
  pricing_history/                historical membership and quote interpretation
  monitor/                        Event queries and Monitor interpretation
  feed/                           Event queries, interpretation, and rendering
  discord/                        interpretation, rendering, and sender submission
  shared/                         genuinely shared product interpretation
scan_analysis/                    collected and extracted observation analysis
public_api/                       independent frozen compatibility path
schema.ts                         direct assembly of shared table definitions
```

`catalog/` contains shared definitions and semantics, not the collection of all table-owned
queries and mutations. Write behavior lives under `ingestion/`; product-shaped reads live
with their products. Introduce a shared Catalog reader only when it hides meaningful domain
behavior required by multiple consumers.

The suggested extraction location moves ORCA-specific policy out of Scan's source-access
interface. Pure extraction remains reusable by scan analysis without invoking ingestion or
writing data. Update named package imports and exports together; replace `#scan/model` with
an observation-oriented name rather than using "model" for an architectural abstraction.

## Proposed table names

Use semantic names without generation prefixes. Catalog tables describe shared retained
knowledge; processing tables retain their existing acceptance and work-tracking meanings.
Catalog columns and indexes will be established in the relevant focused work.

| Existing table                | Proposed table              | Meaning                                              |
| ----------------------------- | --------------------------- | ---------------------------------------------------- |
| `v4_models`                   | `catalog_current_models`    | Current or last-known model facts                    |
| `v4_providers`                | `catalog_current_providers` | Current or last-known provider facts                 |
| `v4_endpoints`                | `catalog_current_endpoints` | Current or last-known endpoint facts                 |
| `v4_current_stats_snapshot`   | `catalog_current_stats`     | Latest processed endpoint readings                   |
| `v4_endpoint_listing_history` | `catalog_listing_history`   | Endpoint availability and relationship transitions   |
| `v4_endpoint_pricing_history` | `catalog_pricing_history`   | Complete endpoint quote transitions                  |
| `v4_endpoint_stats`           | `catalog_stats_history`     | Endpoint readings at source scan times               |
| `v4_events`                   | `catalog_events`            | Self-contained scan-pair Entity events               |
| `v4_scan_ingestions`          | `scan_ingestions`           | Accepted scan pairs under the existing release rules |
| `v4_processor_work`           | `processor_work`            | Existing downstream processing obligations           |

Reserve `catalog_entity_observations` as the proposed name if historical entity knowledge
needs its own retained series. Whether that series is necessary, and what it contains, remains
open. Do not create it merely to replace the current Events lookup with another lookup.

Processing-table renames preserve existing storage shapes and behavior. Independent projection
input registration and progress are deferred with the orchestration redesign. Table renaming
does not imply a new storage shape for every existing projection.

## Implementation sequence

### 1. Separate extraction, projection, and product interpretation

Untangle the stages currently spread across `scan/model.ts`, `scan/provider.ts`, `entities.ts`,
and `catalog/project.ts`. Scan owns collected-data access. Ingestion extraction establishes
ORCA observations; individual projections select, compare, and encode those observations for
their own retained representations. Projections do not reinterpret extracted values or transform
schema fields such as identifiers. Value normalization belongs to extraction.

Extraction semantics, especially provider representative selection and alias normalization,
are stable constraints rather than freely configurable projection policy. Changes to these
semantics require separate design.

Classify existing omissions and normalizations by their intended scope. An extraction omission
affects all projections using that extraction; a Current-view omission affects only that view.
Keep comparison semantics on normalized facts before storage encoding. Shared normalization
is appropriate where domain meanings agree, without forcing Events to share Current-view
metadata selection or making product requirements universal source requirements.

Move reusable identity-context validators out of current table definitions. In particular,
Events must not derive its schema by importing the current entity tables. Consolidate shared
definitions without creating an all-purpose entity shape that every consumer must accept.

Focused questions: the exact extraction output, the home of each existing omission, and which
strong field guarantees belong to extraction versus an individual projection or product.

### 2. Establish shared Catalog definitions and product-owned reads

Introduce the proposed table names and shared definitions. Move current-table write logic
into ingestion retention and move product-shaped queries from `catalog/` and `history/` to
the products they serve. Preserve useful endpoint-scoped access and independent pagination;
the new ownership does not require changing every query shape.

Products may retain their own derived state or delivery state. Their separation from ingestion
means they do not own Catalog mutation, not that they can never have mutations. Keep the
Discord sender's internal storage and responsibilities outside this Catalog restructure.

### 3. Make Events a pure retained scan-pair projection

Retain the pure comparison in `events/prepare.ts` while removing historical enrichment from
Event persistence. `previously_known` becomes product interpretation over historical knowledge,
not a property computed and fixed during Event retention. Event output must remain identical
for the same pair and rules regardless of other pairs already processed.

Resolve historical entity knowledge independently of endpoint availability. The current
combination of Listings lookups and current-model `first_scan_at` exposes the missing distinction
between observing a model and observing it serving through endpoints. Define the representation
needed for this knowledge before moving classification into product queries.

Review the current exclusion of endpointless models from Events. Decide how observed model
facts and serving-availability transitions are represented without conflating the two or
silently inheriting alert selection policy.

Focused questions: historical entity observation representation, first-observation maintenance,
and model/provider Event lifecycle semantics. Historical classification must work within the
existing ingestion lifecycle; product-specific readiness policies are deferred.

### 4. Integrate projections with the existing ingestion lifecycle

Adapt the existing runner and retention calls to the new module boundaries and shared definitions.
Preserve the acceptance mutation, release gate, processor work, retries, and clock advancement.
Events can become a pure projection while retaining its existing downstream execution position.
Pure projection independence does not require independent commits or completion records.

Keep existing initialization and metadata refresh behavior working with the new representations.
Regenerating the affected tables from retained scans is part of this rewrite; it does not require
an operator-facing replacement or historical-extension system. Retain the current product cutoffs
and follow-up triggers, including Discord preparation, while moving their implementation to the
appropriate owners.

### 5. Separate alert product policy and lifecycle

Retain shared pure alert helpers where meanings agree. Make Monitor, Feed, and Discord selection
and interpretation explicit so changes for one product do not automatically become universal
rules. Historical classification and pricing-frequency interpretation belong on this side of
Catalog production.

Discord prepares messages and submits them to its sender; its durable user-facing output is in
Discord. Sender persistence is not a Catalog alert history. Monitor and Feed can remain
query-derived until their own requirements justify retained derived state. Regeneration must
not cause unintended Discord delivery.

## Verification and completion

Verify behavior through projection interfaces and product queries. Preserve tests for existing
transaction and lifecycle guarantees; update tests coupled only to the previous file layout.

- The same scan pair and rules produce the same historical output regardless of previously retained pairs.
- Current-view metadata selection does not change Events or source captures.
- Existing acceptance, retry, completion, and clock behavior survives the module and table changes.
- Initialization and metadata refresh continue to work with the new representations.
- Endpointless model observation remains distinct from serving availability and historical alert classification.
- Products remain usable with existing ingestion cutoffs and processing order.
- Historical computation does not cause unintended Discord delivery.

Regenerate the affected tables from scans and verify the resulting products against those
representations. Run the repository's `bun run fix` and relevant backend tests as implementation
lands. Collection, Objects, and the independent public API keep their existing contracts.

Update conflicting `docs/orca/` documents and repository guidance as each responsibility moves.
In particular, table ownership guidance must reflect shared Catalog definitions and separate
ingestion and product behavior. Preserve upstream observations in `docs/openrouter/`. This plan
remains the implementation direction until its decisions are reflected in the maintained
documentation; unresolved questions should be resolved in focused work, not hidden in file moves.

## Potential next steps

These capabilities are deferred and are not prerequisites or completion criteria for this rewrite.
Design them together when historical extension, selective replacement, or independently advancing
products justify a new ingestion orchestration system.

### Independent projection progress and recovery

Separate exact input registration from projection completion. Baseline and single-scan inputs
need their own identities rather than artificial scan pairs. Each projection's output and
completion should commit together, including empty output, with retries skipping completed work.
Independent retention can use direct composition without independent crons or a processor registry.

Resolve lock scope, ownership, interrupted-work recovery, retry scheduling, and follow-up product
triggers. Large current-view updates may require resumable writes across mutations; historical
table size alone does not justify imposing that machinery on every projection. Planned historical
coverage should remain contiguous, with temporary incomplete work recoverable.

### Historical extension and selective replacement

Support earlier adjacent pairs for backfill, preserving previous-to-next ordering within each pair.
Retain exact source references rather than inferring identity from an assumed hourly interval.
Reprojection needs an explicit projection and input scope, removal of obsolete output, and recovery
when replacement spans mutations. It must not automatically prepare or send alerts.

Define baseline extension and replacement, current-view reconstruction, and removal of superseded
baseline rows. Current stats must advance only with newer scans. Current-view source-time and
first-observation handling must account for earlier-only and departed entities; the existing
unconditional row replacement and preservation of `first_scan_at` are insufficient for backfill.
Selective reprojection assumes compatible extraction semantics.

Verify reverse backfill against forward projection over the same source range, replacement against
obsolete output, and interrupted operations against the chosen locking and recovery design.

### Product-specific readiness and horizons

Decouple the ORCA reference horizon from projection progress and revisit universal historical-reader
cutoffs. Grid and entity overview primarily depend on current facts and stats; Pricing History
combines Listings and Pricing; Monitor uses Events and may need historical knowledge for enrichment.
One product's horizon must not silently certify another projection's completeness.

Decide which products can display independently advancing or partially updated data and which must
wait for relevant dependencies. Define reference-clock advancement and any explicit product horizons.
Start with small product queries or composition functions; a global ready flag or dependency engine
is not required. Verify products against the differences in progress their policies permit.

### Changes to projection rules and retained representations

Changing projection rules affects subsequent computation, not previously retained output.
Generalize the explicit scope of current metadata refresh into projection-appropriate
reprojection operations without requiring simultaneous regeneration of other projections.

Readers may need to interpret older and newer retained representations together. Introduce
representation identifiers or readers for older shapes when a concrete incompatibility requires
them; this plan does not require a global version system. A change in meaning without a change
in shape also needs consideration. Shared validators alone cannot communicate that distinction.

Focused questions: which changes require representation identification, and which historical
differences each product can interpret, omit, or leave for later reprojection.
