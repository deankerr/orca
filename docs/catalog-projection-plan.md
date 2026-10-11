# Catalog projection implementation plan

## Authority and scope

This plan implements the language of `GLOSSARY.md`. For this restructure, its architectural
direction takes precedence over conflicting descriptions in `docs/orca/`. The glossary defines
the concepts; this document proposes their implementation. Existing code, table names, and
documentation describe the starting point rather than constraints on the target design.

Implementation will regenerate the affected Catalog representations from retained scans.
There is no migration of existing Catalog rows into the new tables. Collectors and Objects
remain unchanged. Scan continues to bridge collection and ingestion, with its responsibilities
adjusted as described below. The public API's frozen contract and independent capture-based
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
progress, backfill, and reprojection. Products own interpretation, presentation, delivery,
and any product-specific retained state. Neither side calls the other to access Catalog data;
both depend on shared definitions and use `ctx.db` directly where appropriate.

The shared interface includes validators, identities, and the meaning of retained facts.
For example, Listing state continues, a price quote replaces a complete quote, and a stats
reading does not carry forward. Shared pure helpers can embody these meanings. A generic
repository or a wrapper around every table read is unnecessary.

Coordination belongs to ingestion, but pure projections remain independent modules. A runner
can load source data once and compose them directly. Keeping them in one execution sequence
does not require one transaction, one progress record, or a generic processor registry.

Routine hourly writes are expected to be small. The exceptional workload of concern is a
broad change to large current entity records. Historical table size alone is not a reason to
introduce batching or cross-projection barriers. Start with simple separate commits and give
large current-view updates particular attention when defining mutation limits and recovery.

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
    inputs.ts                     exact source-input definitions
    progress.ts                   per-projection progress definition
ingestion/
  run.ts                          forward orchestration and scheduling
  inputs.ts                       input selection and registration
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
    current.ts                    current-view writes and forward/source-time rules
    listings.ts                   retained Listing output and completion
    pricing.ts                    retained Pricing output and completion
    stats.ts                      retained readings, current stats, and completion
    events.ts                     retained Event output and completion
  baseline.ts                     initial state composition
  backfill.ts                     earlier adjacent input processing
  reproject.ts                    explicit replacement of selected retained output
  progress.ts                     completion and recovery operations
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
knowledge; processing tables describe source inputs and progress. Their exact columns and
indexes will be established in the relevant focused work.

| Existing table                | Proposed table              | Meaning                                                    |
| ----------------------------- | --------------------------- | ---------------------------------------------------------- |
| `v4_models`                   | `catalog_current_models`    | Current or last-known model facts                          |
| `v4_providers`                | `catalog_current_providers` | Current or last-known provider facts                       |
| `v4_endpoints`                | `catalog_current_endpoints` | Current or last-known endpoint facts                       |
| `v4_current_stats_snapshot`   | `catalog_current_stats`     | Latest processed endpoint readings                         |
| `v4_endpoint_listing_history` | `catalog_listing_history`   | Endpoint availability and relationship transitions         |
| `v4_endpoint_pricing_history` | `catalog_pricing_history`   | Complete endpoint quote transitions                        |
| `v4_endpoint_stats`           | `catalog_stats_history`     | Endpoint readings at source scan times                     |
| `v4_events`                   | `catalog_events`            | Self-contained scan-pair Entity events                     |
| `v4_scan_ingestions`          | `projection_inputs`         | Exact source scans for a pair or initial/single-scan input |
| `v4_processor_work`           | `projection_progress`       | Processing progress for each projection and input          |

Reserve `catalog_entity_observations` as the proposed name if historical entity knowledge
needs its own retained series. Whether that series is necessary, and what it contains, remains
open. Do not create it merely to replace the current Events lookup with another lookup.

The two processing tables replace the meaning of their predecessors rather than merely
renaming them: registering an input is not acceptance of all its projections. Baseline and
single-scan inputs must not be disguised as artificial scan pairs. Table renaming does not
imply a new storage shape for every existing projection.

## Design prerequisite: ingestion orchestration

Redesign ingestion orchestration before implementation. This outstanding design task covers
forward ingestion, baseline initialization, backfill, and reprojection together. Its decisions
inform the implementation sequence below, including input registration, projection progress,
recovery, and observation-horizon advancement.

Use locking to prevent concurrent operations from modifying the same data. Resolve lock scope,
ownership, and recovery after interruption as part of this design. Define how partial completion
is resumed and which work may proceed while a projection remains unfinished. Planned historical
coverage stays contiguous; arbitrary gaps are outside this plan. Temporary incomplete work
remains a recoverable processing condition.

## Implementation sequence

### 1. Separate extraction, projection, and product interpretation

Untangle the stages currently spread across `scan/model.ts`, `scan/provider.ts`, `entities.ts`,
and `catalog/project.ts`. Scan owns collected-data access. Ingestion extraction establishes
ORCA observations; individual projections select, compare, and encode those observations for
their own retained representations. Projections do not reinterpret extracted values or transform
schema fields such as identifiers. Value normalization belongs to extraction.

Extraction semantics, especially provider representative selection and alias normalization,
are stable constraints rather than freely configurable projection policy. Changes to these
semantics require separate design; selective reprojection assumes compatible extraction semantics.

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
and model/provider Event lifecycle semantics. Products needing historical classification
must acknowledge that additional dependency in their readiness decisions.

### 4. Separate projection commits and progress

Replace the shared acceptance mutation in `ingest.ts` and the acceptance gate in
`ingestion/release.ts` with exact input identity and independent projection progress. Each
projection's output and completion commit together, including empty output. A failed projection
does not undo another's completed work, and retries skip completed work unless reprojection
was explicitly requested.

Implement the prerequisite orchestration design using direct composition. Independent retention
does not require independent crons. Remove the special status of Events as work released only
after a different set of tables has constituted "the ingestion."

Recovery must identify unfinished work after interruption. If current-view output needs multiple
mutations, establish resumable progress and mark completion only after all of that output is
retained. Do not impose that machinery on small writes without need.

The orchestration design must establish progress granularity, interrupted-current-write recovery,
ordinary retry scheduling, and the trigger for follow-up product work such as Discord preparation.

### 5. Support historical extension and deliberate reprojection

Add selection of earlier adjacent pairs for backfill. Each pair remains ordered previous-to-next
even when pairs are processed backwards.

Define explicit retention versus replacement for an input's projected output. Replacement must
also remove obsolete rows that the new projection no longer produces. Preserve exact source
references so identity is not inferred from an assumed hourly interval. Reprojection has a
selected projection and input scope, and does not automatically prepare or send alerts.

Current stats advances only with newer scans. Current view requires separate source-time and
first-observation handling: the existing writers replace rows unconditionally and preserve
`first_scan_at`, which is insufficient for earlier-history extension. Earlier-only entities,
departed entities, and baseline replacement need explicit treatment before backfill is complete.

Focused questions: baseline extension and replacement, current-view reconstruction, removal of
superseded baseline rows, and recovery if a selected reprojection requires more than one mutation.

### 6. Derive readiness and horizons where products need them

Decouple `clock.ts` from the old acceptance record. Keep an ORCA reference horizon while exposing
projection progress as a separate fact. Revisit the universal clock cutoff in historical readers;
one product's horizon must not silently certify another projection's completeness.

Grid and entity overview primarily depend on current entity facts and current stats. Pricing
History combines Listings and Pricing. Monitor's core input is Events; historical enrichment
can add dependencies. Mixed results ("tearing") are acceptable, including partially updated
current views during writes spanning multiple mutations. Products can display independently
advancing data or wait for relevant dependencies according to their own requirements.

Use small product queries or composition functions for these choices. A global ready flag or
general dependency engine is not a prerequisite. Query-time interpretation is the default place
to start; additional product materialization requires a concrete product need.

Focused questions: what advances the reference clock, which products need an explicit horizon,
and the limited readiness policies each product actually requires.

### 7. Separate alert product policy and lifecycle

Retain shared pure alert helpers where meanings agree. Make Monitor, Feed, and Discord selection
and interpretation explicit so changes for one product do not automatically become universal
rules. Historical classification and pricing-frequency interpretation belong on this side of
Catalog production.

Discord prepares messages and submits them to its sender; its durable user-facing output is in
Discord. Sender persistence is not a Catalog alert history. Monitor and Feed can remain
query-derived until their own requirements justify retained derived state. Remove automatic
delivery assumptions from ingestion entry points used for backfill and reprojection.

### 8. Preserve retained output across changes to projection rules

Changing projection rules affects subsequent computation, not previously retained output.
Generalize the explicit scope of current metadata refresh into projection-appropriate
reprojection operations without requiring simultaneous regeneration of other projections.

Readers may need to interpret older and newer retained representations together. Introduce
representation identifiers or readers for older shapes when a concrete incompatibility requires
them; this plan does not require a global version system. A change in meaning without a change
in shape also needs consideration. Shared validators alone cannot communicate that distinction.

Focused questions: which changes require representation identification, and which historical
differences each product can interpret, omit, or leave for later reprojection.

## Verification and completion

Verify behavior through projection interfaces and product queries, rather than preserving
tests whose only purpose was to enforce the previous shared transaction or file layout.

- The same scan pair and rules produce the same historical output regardless of previously retained pairs.
- Current-view metadata selection does not change Events or source captures.
- Output and its completion agree, including empty output, repeated attempts, and interrupted processing.
- Locking prevents concurrent modification of the same data, including during recovery after interruption.
- Reverse backfill matches forward historical projection over the same contiguous source range.
- Older inputs cannot regress current stats; current-view and baseline behavior follows the focused design.
- Endpointless model observation remains distinct from serving availability and historical alert classification.
- Reprojection removes obsolete output in its selected scope while leaving other retained projections intact.
- Products remain usable under the differences in projection progress that their policies allow.
- Historical computation does not cause unintended Discord delivery.

Regenerate the affected tables from scans and verify the resulting products against those
representations. Run the repository's `bun run fix` and relevant backend tests as implementation
lands. Collection, Objects, and the independent public API keep their existing contracts.

Update conflicting `docs/orca/` documents and repository guidance as each responsibility moves.
In particular, table ownership guidance must reflect shared Catalog definitions and separate
ingestion and product behavior. Preserve upstream observations in `docs/openrouter/`. This plan
remains the implementation direction until its decisions are reflected in the maintained
documentation; unresolved questions should be resolved in focused work, not hidden in file moves.
