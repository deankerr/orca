# ORCA Labs data pipeline

Labs turns historical or actively captured OpenRouter observations into trustworthy reusable
evidence and disposable product views. This glossary is the canonical language for that pipeline.

## Inputs and observations

**Capture**:
One immutable observation of upstream data and the evidence needed to interpret whether it
succeeded. Historical snapshot contents and newly collected data are both captures.
_Avoid_: Snapshot, when referring to newly collected data

**Crawl**:
One capture attempt identified by its crawl id. A crawl may contain a usable bundle or evidence that
the attempt failed.
_Avoid_: Snapshot, batch

**Crawl id**:
The stable identity of a crawl, currently a millisecond timestamp encoded as a decimal string. It
orders crawls and identifies the observation; it is not a promise of product-level precision.
_Avoid_: Date, revision

**Bundle**:
The exact raw JSON payload stored for one crawl. Materialization may accept or exclude its
observation, but the archive retains the bytes unchanged.
_Avoid_: Crawl, projection batch

**Scope**:
One upstream grouping inside a bundle containing a model record and its endpoints. Only scopes with
text-output endpoints are in the current core domain.
_Avoid_: Model, provider

**Snapshot export**:
An immutable Convex backup ZIP used as a historical capture source. It is an input container, not a
Labs artifact or a product database.
_Avoid_: Snapshot, archive

**Extracted snapshot**:
The selected crawl metadata and stored bundle blobs extracted from a snapshot export. It remains a
source-shaped intermediate and does not imply that its bundles are trustworthy.
_Avoid_: Corpus

**Raw bundle archive**:
The append-only, full-precision sequence of exact bundle bytes and source evidence. Historical and
active captures share this contract; product projections read it directly.
_Avoid_: Corpus, product database

## Materialization policy

**Dropped bundle**:
A bundle excluded from one product projection because its observation is unusable for that
processor. It remains raw evidence, and exclusion does not itself mean entities became unavailable.
_Avoid_: Failed crawl

**Accepted crawl**:
A crawl whose raw bundle produced a projection batch. Acceptance means usable evidence for that
processor, not that every upstream field is part of the core schema.
_Avoid_: Successful fetch

**Embedded model copy**:
The model record carried by an endpoint in an upstream scope. These copies are the sole authority
for projected models because they match the production materialization behavior.
_Avoid_: Outer model, scope model

**Outer model**:
A scope-level model record not reached through an endpoint copy. It is fetch/traversal metadata and
must not create a projected entity or lifecycle event.
_Avoid_: Canonical model

## Projection and history

**Core entity**:
A selected model or endpoint whose identity and fields have a concrete product, joining, or
availability purpose. Unselected upstream fields are not implicitly part of the entity.
_Avoid_: Raw record

**Endpoint metric**:
A volatile observation such as latency or throughput associated with an endpoint and crawl. It is
not endpoint state and does not generate endpoint change history.
_Avoid_: Endpoint field

**Materialization**:
The pure read of one raw bundle that applies product-scope filtering, validates core fields,
deduplicates endpoint-embedded model copies, and selects entities and metrics. It produces one
projection batch but does not compare history or write a store.
_Avoid_: Projection, replay

**Projection batch**:
The complete selected models, endpoints, and metrics observed in one accepted crawl. It is the input
to a state transition.
_Avoid_: Bundle, crawl plan

**Projection**:
A disposable, rebuildable product-oriented view derived directly from authoritative captures. A
projection may contain current state, history, or both.
_Avoid_: Archive, source of truth

**Projection state**:
The complete selected entity state after a processed crawl. It excludes immutable event history and
volatile endpoint metrics.
_Avoid_: Database, current crawl

**Current view**:
The latest projection state stored for product reads, plus separately maintained latest endpoint
metrics where needed. It is replaceable and can be rebuilt from the raw archive.
_Avoid_: Snapshot, catalog

**Crawl plan**:
The pure description of one transition from prior projection state to a projection batch, including
the next state and immutable entity events.
_Avoid_: Diff, transaction

**Historical replay**:
Chronological materialization and application of raw archive bundles through the same processing
contracts intended for active captures. Replay produces evidence but never live alert delivery.
_Avoid_: Import, migration

**Historical precision**:
The crawl-selection policy applied while building a projection. `full` retains every accepted crawl;
`daily` retains the final accepted crawl of each UTC day and therefore represents net daily change.
_Avoid_: Archive precision, sampling rate

**Entity event**:
An immutable, deterministic record that one core model or endpoint was at the baseline, became
available, changed, or became unavailable at a selected crawl.
_Avoid_: Change document, diff

**Field change**:
One path-level before/after fact attached to an updated entity event, with presence recorded
separately from JSON value. Lifecycle events do not synthesize field changes.
_Avoid_: Patch

**Baseline event**:
Evidence that an entity exists at the lower bound of a projection. It is not evidence that the
entity first became available at that crawl.
_Avoid_: Created event, initial availability

**Availability transition**:
An observed absent-to-present or present-to-absent entity transition between selected crawls. Its
event kinds are `available` and `unavailable`.
_Avoid_: Creation, deletion

**Availability period**:
One continuous interval in which an endpoint is present, beginning at a baseline or available event
and optionally ending at an unavailable event. Reappearance begins a new period for the same id.
_Avoid_: Endpoint lifetime, pricing series

**Product database**:
A disposable query store containing a selected current view, latest endpoint metrics, crawl lineage,
and immutable entity events for product reads.
_Avoid_: Raw archive, source database

## Artifact lifecycle

**Artifact**:
A reproducible output of a Labs program with an explicit kind and format version. An artifact is
eligible as an implicit input only after its run succeeds and publishes it.
_Avoid_: File, output

**Run**:
One execution of an artifact-producing program, identified by a timestamped run id and retaining
success or failure evidence.
_Avoid_: Build, artifact

**Run report**:
The durable lifecycle record for a run: program, options, inputs, metrics, status, timing, failure,
and published artifact when successful. It is also the local artifact index.
_Avoid_: Manifest, log

**Run log**:
The structured chronological record of operational progress and timings for one run. It supplements
the summarized run report and is not product data.
_Avoid_: Event history, report

## Product reads

**Monitor batch**:
All entity events belonging to one selected crawl, returned together even when a filter was used to
discover that crawl.
_Avoid_: Event page

**Pricing point**:
A timestamped availability or sparse tracked-price change within one endpoint availability period.
A missing price is unchanged; a null price was explicitly removed.
_Avoid_: Price snapshot

**Pricing history**:
The product read that groups endpoint lifecycle and tracked price changes into availability periods
for one model.
_Avoid_: Endpoint history, price log
