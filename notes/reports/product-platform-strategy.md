# Product-first platform strategy

**Status:** working direction with an isolated platform proof and a first replacement slice selected.
This report remains non-authoritative until its decisions are accepted and folded into the top-level
objectives.

## Decision

ORCA should be driven by four product promises, not by a historical capture system:

1. the catalog is current and useful for comparing models and endpoints;
2. Monitor explains meaningful catalog changes;
3. Alerts reliably delivers the same changes selected by its subscribers;
4. the public API exposes a stable projection of the current catalog.

The system should observe OpenRouter often enough to satisfy those promises, publish the latest
normalized `Inventory` through the shared `InventoryStore`, and retain at most one coarse, validated
upstream dump per day as a recovery and investigation aid. Historical replay is no longer an
application architecture.

This changes the central flow from:

```text
capture artifacts -> replay/materialize -> products
```

to:

```text
OpenRouterClient -> InventoryStore.publish -> shared Data R2
                                           |- models/current.json
                                           \- models/archive/YYYY-MM-DD.json.gz
Public API V2 Worker -> InventoryStore.current --------^ -> D1 -> V2 HTTP
Convex -> authenticated current-inventory HTTP adapter-^ -> reactive Grid/model projections
```

The inventory contains the shared `ModelEndpoints` handoff, not a queryable persisted “master current”
model. Each product module independently pulls it and owns the transformation, cursor, retry policy,
and state required by its product. Current transport and the daily dump are separate objects in the
same store and bucket; the daily object is never an input to normal product reads or live change
delivery.

## Product promises

### Catalog and Endpoints Data Grid

- Preserve the existing Convex reactive reads during the transition, but do not treat Convex's
  current representation as the system-wide catalog contract.
- Let a Convex scheduled action pull the current inventory through authenticated conditional HTTP.
  Convex should build the model, endpoint, and provider entities its own queries need, including
  extracting provider entities from endpoints.
- Do not route this through `apps/engine`, a generic sink, or an intermediate Cloudflare “master”
  current projection.
- Add fields, filters, and modality support inside the product projection without changing upstream
  acquisition or archive formats.
- Reconsider the ownership of Grid and model-page reads once the Monitor change system has the
  current view it necessarily needs. That view, rather than a second speculative catalog store, is
  the credible path to making Convex current state obsolete.

### Monitor

- Treat Monitor as the main unresolved architecture problem, not as a small output of generic
  catalog ingestion.
- Maintain the current comparison state required to derive meaningful product change events from
  each normalized update.
- Give every persisted event a stable identity and the model, endpoint, provider, path, and
  before/after data needed by known product queries.
- Page and filter events directly. An update may remain a presentation group, but storage and
  pagination must not inherit an upstream crawl's batching.
- Keep exact detection time only where it improves feed ordering and alert delivery. Do not make
  sub-day time precision part of archive layout, event identity, or reconstruction logic.
- Design the current view, event model, initialization behavior, and query surface together. This is
  where most architecture effort should go because the same state can eventually replace Convex's
  current catalog rather than creating another temporary representation.

### Alerts

- Deliver the exact persisted Monitor event identity rather than independently recomputing a change
  for Discord.
- Use a dedicated Cloudflare Queue and dead-letter queue for at-least-once delivery. Consumers must
  be idempotent by event and subscription identity.
- Keep subscription and deduplication records because they are product correctness state. Delivery
  counts, timings, and failure rates belong in telemetry, not product tables.
- Only live update processing invokes alert delivery. Initialization, offline repairs, and projection
  rebuilds do not, so historical events cannot accidentally broadcast.

### ORCA API

- Make `@orca/public-api-v2` the first product hosted by the new Cloudflare stack. It is already a
  simple, self-contained V2 transformation and D1 current projection, so this produces an early
  end-to-end replacement rather than another isolated proof.
- Give it a standalone Worker and deployment lifecycle. This compatibility product is intentionally
  isolated because it will remain legacy by nature and should own all of its public HTTP behavior.
- Change its input from engine-shaped raw archive observations to the shared `ModelEndpoints`
  standard from `@orca/openrouter`. Remove its call to `@orca/entities/toModelEndpoints`; raw endpoint
  healing and nested-model removal belong exclusively to `OpenRouterClient`.
- Keep V2-specific validation and transformation private to the package. Consuming the shared input
  does not make the V2 response schema a shared catalog schema.
- Let the Worker conditionally pull the current inventory through the shared `InventoryStore` Layer,
  then update its D1 projection. It owns its polling schedule, cursor, retries, D1 database and
  migrations, serving route, and telemetry.
- Cut the existing public route over after response compatibility is verified, then remove the
  superseded Convex V2 serving path and `apps/engine` Public API V2 wiring.
- Keep future V3 design separate from upstream reading, persistence, and the V2 compatibility
  promise.

### Pricing history

- Design pricing history with Monitor and Alerts, because all three depend on the same accepted
  endpoint changes and period-valid context.
- Treat pricing history as a projection of persisted endpoint pricing events plus current endpoint
  state.
- Use change points or daily granularity; do not recreate high-frequency crawl history.
- Do not bolt another history mechanism onto the transitional Convex current ingestion.

## Data classes and ownership

| Data class                           | Purpose                                                                            | Initial owner                                                  | Retention rule                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Current inventory object             | Latest complete `Inventory` for independent product pulls                          | `@orca/inventory` stores it; catalog publishes; products pull  | Replace in place; not a queryable master view                           |
| Public API V2 current projection     | Drives the V2 response                                                             | `@orca/public-api-v2` on D1                                    | Replace by V2 model identity                                            |
| Transitional web current projections | Drives Grid and model pages while those products remain on Convex                  | Convex product ingestion                                       | Replace by product identity                                             |
| Change comparison view and events    | Drives Monitor, Alerts, and pricing history; may later drive current catalog reads | New Cloudflare product module, platform selected during design | Current view replaced by identity; events retained while product-useful |
| Daily upstream dump                  | Recovery, investigation, and bounded future reprocessing                           | `@orca/inventory` in the shared R2 bucket                      | One validated normalized object per UTC day                             |
| Operational telemetry                | Health, activity, latency, errors, and retries                                     | Effect telemetry and Cloudflare Workers observability          | Platform-managed                                                        |

This classification excludes persisted crawl attempts, unusable responses, custom metrics tables,
byte-for-byte response evidence, and fine-grained archive indexes. A failed or invalid upstream read
is observable but does not become historical data.

The daily R2 key can be intentionally boring:

```text
models/archive/YYYY-MM-DD.json.gz
```

A later successful normalized read on the same day replaces the object. The object contains the
normalized upstream inventory, not product projection rows or transport telemetry.

## Current inventory pull flow

A Cloudflare Workflow should own one upstream read because acquisition and its R2 writes must survive
a Worker invocation ending. Cron starts it in production; local development can call the deployed
Worker's authenticated update route using the current URL and API key from Alchemy and the package env
file.

1. **Read.** `OpenRouterClient` obtains the upstream catalog entries and endpoint results. It
   validates safe identity fields and encapsulates the raw endpoint-result to `{ model, endpoints }`
   transform. Dynamic, non-identity fields remain data rather than becoming an ingestion-wide
   validation gate. A model that disappears between the catalog and endpoint reads is omitted and
   logged rather than represented with an invented empty endpoint list.
2. **Publish.** The Workflow calls `InventoryStore.publish`, which atomically replaces the stable
   current object and replaces that day's compressed archive object in the same bucket. The current
   object is active transport state, not a product entity store. Its ETag only lets conditional reads
   skip unchanged payloads; it is not a domain identity or ordering key.
3. **Pull independently.** Cloudflare products call `InventoryStore.current`; Convex will use an
   authenticated HTTP adapter. Each retains its last usable projection when inventory storage is
   unavailable and tries again on its own schedule.
4. **Apply privately.** Each consumer validates the shared inventory, performs its product-specific
   transformation, and advances its cursor only after its projection is usable. Consumer failure and
   recovery are never part of the catalog Workflow.

The current inventory object initially promises convergence to the newest complete inventory, not
observation of every intermediate inventory. That is sufficient for Public API V2 and Convex because
a newer complete value repairs a missed older one. During Monitor design, decide explicitly whether
the change system needs every accepted transition. If it does, add a separate ordered, short-lived
update feed with its own cursors and recovery semantics rather than silently strengthening this
interface.

The current object is intentionally not the daily archive: live products must not discover archive
keys or use historical dumps as their normal source. Conditional reads avoid transferring the large
payload when it has not changed.

Every acquisition side effect belongs in a named Workflow task. Cloudflare generates a unique
Workflow instance ID; ORCA calls it `runId` and uses it only for status lookup and telemetry
correlation. It is not embedded in `Inventory`, archives, or product projections.

## Package-local glossary

These terms define the language around `@orca/openrouter`, `@orca/catalog`, and the product packages
that consume their output. They are deliberately local to these package seams; other ORCA packages
are not required to adopt them where their own product language is clearer.

**OpenRouterClient**:
The Effect service that reads and normalizes current OpenRouter data. Upstream request paths,
response schemas, retries, concurrency, and model healing are private to it.
_Avoid_: OpenRouter reader, OpenRouter catalog

**Upstream catalog entry**:
A private row from OpenRouter's catalog discovery response. It determines whether and how the client
should request endpoints, but it is not returned downstream.
_Avoid_: Catalog model, source model

**Upstream endpoint**:
A private endpoint response row containing an unhealed embedded model. The embedded model is used to
build a `ModelVariant` and then removed from the endpoint because it is duplicated on every row.
_Avoid_: Source endpoint, raw endpoint

**ModelVariant**:
A healed model record for one routable variant, including the `standard` variant. Its identity and
display fields describe the exact variant represented by its endpoints.
_Avoid_: Model

**Endpoint**:
One provider configuration offering a `ModelVariant`. All decoded upstream fields are retained except
the duplicated embedded model.

**ModelEndpoints**:
One `ModelVariant` paired with its non-empty endpoint list. This is the standard shared product input;
the client never returns a `ModelEndpoints` value with zero endpoints.
_Avoid_: Catalog scope, endpoint scope, raw endpoint batch

**Inventory**:
One complete, usable OpenRouter observation: its observation time and all returned `ModelEndpoints`
values. The envelope and identity guarantees belong to ORCA even though other model and endpoint
fields remain intentionally source-shaped. It is not a historical snapshot, canonical current view,
or product projection.
_Avoid_: OpenRouterInventory, catalog snapshot, master catalog

**InventoryStore**:
The shared Effect service and Alchemy Layer that publishes an `Inventory`, maintains its current and
coarse daily R2 objects, and conditionally reads the current value. Object keys, codecs, compression,
metadata, and R2 response handling are private to it.
_Avoid_: CurrentInventory, CurrentInventorySource, master catalog, update log

**Consumer cursor**:
A product projection's record of the inventory it last applied successfully. It is product
correctness state, not operational telemetry.

**Run ID**:
The Cloudflare-generated identity of one Workflow instance, used for status lookup and telemetry
correlation only.

**CatalogEvent**:
A product-relevant change produced by the future change module while comparing an inventory with its
owned current view. Monitor, Alerts, and pricing history share the event identity and relevant fields.

**Product projection**:
A product-owned representation derived from `ModelEndpoints`, such as V2 models in D1 or Grid entities
in Convex. There is intentionally no requirement that different product projections share a schema.

### Schema visibility and excess keys

The public `@orca/inventory` schemas are `ModelVariant`, `Endpoint`, `ModelEndpoints`, and `Inventory`.
`OpenRouterClient` keeps upstream transport schemas private at the top of its own file and produces
the shared inventory format. `InventoryStore` uses the same schema for current and archive encoding and
current reads. Product input/output schemas stay with the product module that validates or serves them
and are exported only where another package actually consumes them.

Excess keys are retained only while decoding upstream embedded models and endpoints, and on the
corresponding public `ModelVariant` and `Endpoint` schemas so those fields survive downstream
encoding. Response envelopes, summaries, and package-owned containers remove unspecified keys.
Type-only Workflow and receipt contracts do not pretend to perform runtime validation. Opaque maps
such as pricing, features, and data policy remain open records.

## Module seams

Each product capability should be a deep module. Its interface is the caller and test surface; its
Alchemy, Effect, and Cloudflare implementation remains private.

| Module                   | Small interface                        | Implementation hidden behind it                                                           |
| ------------------------ | -------------------------------------- | ----------------------------------------------------------------------------------------- |
| OpenRouter client        | `read`                                 | Requests, concurrency, retries, safe identity decoding, endpoint/model normalization      |
| Inventory store          | `publish(inventory)`, `current(etag?)` | Shared R2 resource, namespaced keys, codecs, daily compression, conditional current reads |
| Public API V2            | `refresh`, `getModels`                 | Projected source ETag, V2 validation/transformation, D1 projection, response assembly     |
| Convex catalog ingestion | `refresh`                              | Source cursor, product-specific model/endpoint/provider extraction and reactive documents |
| Change system            | `observe(inventory)`                   | Current comparison view, event derivation and identity, Monitor and pricing projections   |
| Alert broadcaster        | `publish(events)`                      | Queue, dead-lettering, subscription matching, Discord transport, deduplication            |

There is no generic catalog publisher interface. Catalog publishes one current inventory without
knowing its readers. Product modules differ in state, correctness, queries, and lifecycle, so each
owns its own pull and projection implementation.

Each I/O capability should be an Effect `Context.Service` with its real implementation in an Alchemy
Layer. A test adapter supplies controlled upstream data or in-memory storage where that is useful.
Workflows and handlers orchestrate these capabilities; Cloudflare binding and SDK types must not leak
through their interfaces.

## Package and deployment shape

Begin with packages that create real public/private seams:

```text
packages/
  inventory/        # shared inventory schemas, R2 storage module, and resource lifecycle
  openrouter/       # independent upstream client and normalization
  catalog/          # acquisition Workflow, trigger, and telemetry
  public-api-v2/    # standalone legacy Worker, V2 projection, D1, migrations, and HTTP
  changes/          # future current comparison view, Monitor events, and pricing projection
  alerts/           # Discord interaction/delivery module and owned Cloudflare resources
  entities/         # existing product contracts; narrow as consumers adopt ModelEndpoints directly
apps/
  web/              # existing Next.js product
  logos/            # existing standalone logo Worker
```

`packages/inventory/alchemy.run.ts` reconciles the shared data bucket independently of its producers
and consumers. `InventoryStore.layer` gives Cloudflare Workers the same read/write implementation;
write restriction is not used as a substitute for module design. `@orca/catalog` and
`@orca/public-api-v2` retain independent Workers and Alchemy stacks, both referencing the inventory
stack. Convex will use the equivalent authenticated HTTP adapter because it cannot receive a native
R2 binding.

The OpenRouter client remains an in-process package dependency rather than a deployed service. It has
no Workflow, archive, or product-store knowledge, so downstream projections can change without
changing upstream acquisition.

Likewise, `packages/alerts` owns its Queue, dead-letter queue, and delivery storage. The future change
module owns the current comparison view and event storage it requires. Resource ownership follows the
product invariant, not a desire to minimize the number of Cloudflare resources.

## Isolated platform proof

The current proof implements the acquisition and platform path without writing to an external product
store:

- `@orca/openrouter` independently reads and normalizes live OpenRouter inventory;
- `@orca/catalog` composes the client with a Workflow, hourly cron, and replace-by-day R2 archive;
- the Worker exposes health, Workflow status, and a config-secret-protected manual update route;
- a single-purpose local `trigger` command reads the current Worker URL from Alchemy's persisted stack
  output and calls that route with the same API key loaded from the package env file;
- each Alchemy stage provisions a seven-day Axiom OTEL logs dataset and an ingest token restricted to
  that dataset; `Axiom.Telemetry` exports the existing structured Effect logs directly;
- Alchemy/Cloudflare deployment, remote Workflow triggering, completion, R2 replacement, and Axiom log
  queries have been exercised end to end.

The next proof publishes through the shared inventory module and lets Public API V2 pull through the
same module. It is deployed in parallel first: engine ownership is removed, while the live Convex
route remains until a separate public-launch decision.

The proof deliberately did not begin with golden contract tests. The OpenRouter-facing schemas
validate stable identity and useful known fields while remaining flexible where upstream entity fields
are intentionally carried through. Product compatibility tests should assert the V2 response and
cutover behavior, not freeze upstream payload shapes as golden fixtures.

## What remains and what goes

### Retain during migration

- existing user-facing Monitor, Grid, model, pricing, Alerts, and API behavior as compatibility and
  acceptance targets;
- Convex current catalog and reactive web queries only until a replacement current view serves those
  product needs;
- `@orca/public-api-v2` as the product-owned V2 compatibility projection;
- Alchemy, Cloudflare, and Effect as the provisioning, runtime, and observability substrate;
- daily R2 data sufficient to investigate or rebuild a recent product projection.

### Replace

- Convex V2 serving and `apps/engine` Public API V2 wiring with the Cloudflare-hosted
  `@orca/public-api-v2` package;
- snapshot-shaped Convex current ingestion with a consumer-owned pull of `ModelEndpoints` while Convex
  remains a product store;
- snapshot-driven Monitor and pricing derivation with a purpose-designed current comparison view and
  product event store;
- Convex alert broadcasting with an Alerts module backed by Cloudflare Queue delivery;
- Convex current catalog once the change system's necessary current view can satisfy Grid and model
  product reads;
- `apps/engine` with package-owned modules. It is migration input, not a pattern source.

### Do not build

- a full-history replay platform;
- reversible artifact protocols or byte-preserving capture formats;
- a generic sink/plugin or catalog-publisher infrastructure;
- a speculative Cloudflare “master current” store before the change system defines what current state
  it actually requires;
- a custom scheduler, retry engine, metrics database, or deployment registry;
- storage portability interfaces without two justified adapters.

## Delivery sequence

### 1. Publish current inventory and move Public API V2 to Cloudflare

- Add the shared `@orca/inventory` module with replace-in-place current data, a coarse daily archive,
  namespaced object keys, and conditional read support.
- Change `@orca/public-api-v2` to consume `Inventory`/`ModelEndpoints` instead of raw JSON
  archive observations.
- Remove its dependency on `@orca/entities/toModelEndpoints`, its raw envelope decoder, and its
  engine-specific batch interface. Retain only V2-specific decoding and mapping.
- Move the D1 migration and resource definition out of `apps/engine`; add the package-owned standalone
  Worker, route, D1 Layer, polling schedule, cursor, and telemetry.
- Give the Worker `InventoryStore.layer` and update D1 only when the current object ETag changes.
- Compare complete V2 responses with the existing endpoint and delete the engine wiring this
  deployment replaces. Keep public routing and Convex V2 serving unchanged until a separate cutover.

**Exit:** `@orca/public-api-v2` serves a directly testable Cloudflare endpoint from its own D1
projection, no longer exists in engine, and is ready for an explicitly approved public cutover.

### 2. Let Convex pull normalized inventory

- Add an authenticated conditional HTTP reader for the current inventory and let a Convex scheduled
  action poll it.
- Add narrow Convex ingestion for normalized `ModelEndpoints` plus the observation metadata it needs
  for freshness and idempotence.
- Let Convex derive its own model, endpoint, and provider documents for Grid and model-page queries.
- Do not make Convex's internal shape a shared catalog schema and do not route through an engine sink
  or generic publisher.
- Run the paths together briefly, compare product query behavior, cut current Grid/model reads over,
  and delete the snapshot materialization path this replaces.

**Exit:** current Convex product reads no longer depend on archive batches or `apps/engine`, even though
Convex remains a transitional product store.

### 3. Design Monitor, Alerts, and pricing history as one change system

- Specify event identities and fields from the actual Monitor filters, pagination, Alerts matching,
  Discord content, and pricing chart queries.
- Specify the minimum current comparison state needed to derive those events from consecutive
  `ModelEndpoints` updates.
- Decide initialization, missed-update recovery, idempotent reapplication, event retention, and how
  offline repair is prevented from broadcasting Alerts.
- Select Cloudflare storage from those access patterns and consistency requirements, not from the old
  snapshot tables.
- Determine whether this current view can also serve the Grid and model pages. Prefer extending the
  necessary view over retaining two competing current catalogs.

**Exit:** the hardest product state has a concrete interface, storage model, failure semantics, query
plan, and cutover/deletion plan before implementation begins.

### 4. Build and cut over the change system

- Apply each live normalized update to the owned current view and persist meaningful Monitor/pricing
  events idempotently.
- Serve Monitor and pricing history from those events with product-shaped pagination and granularity.
- Publish the same event identities to the Alerts Queue and move Discord delivery after behavior
  parity.
- If the current view satisfies Grid and model-page requirements, move those reads and provider
  projections to it and retire the transitional Convex current ingestion.

**Exit:** Monitor, Alerts, and pricing history no longer depend on snapshots; the shared change system
owns the useful current view, and Convex current is obsolete if no remaining product read requires it.

### 5. Shut down the remaining snapshot system

- Make the live normalized update path authoritative for every retained product.
- Remove remaining dependencies on snapshot archives, crawl batches, and historical replay.
- Shut down `@orca/backend` snapshots and delete superseded engine, Convex, and test code.
- Improve Grid and Monitor features from the simpler product-owned projections; design API V3 only
  from user-facing needs.

**Exit:** the primary objective in `notes/objectives.md` is complete, and a missing archive cannot
break a live product.

## Decision rules

Use these rules to keep the rewrite from becoming another infrastructure project:

1. **Replace something in each slice:** a platform proof is complete only when traffic moves and the
   superseded path can be deleted.
2. **Share inputs, own projections:** `ModelEndpoints` crosses product seams; current documents and
   response schemas do not unless a real caller requires them.
3. **Let required state become the current view:** design the Monitor/change state deeply before
   declaring any store the master catalog.
4. **Pull current projections:** catalog publishes one current inventory; current-state products own
   their schedule, cursor, retry policy, and projection.
5. **Platform before implementation:** Workflow for durable steps, Queue for buffered delivery, R2
   for current transport and daily objects, product-owned databases for product state, and Workers
   telemetry for operations.
6. **One owner per resource:** provision a product-owned resource before coupling unrelated modules
   through a shared one.
7. **Interface before location:** define a deep module interface, then choose whether its adapter is
   in-process, a binding, or RPC.
8. **Split on evidence:** packages are cheap; network and Stack seams need independent lifecycle or
   scaling evidence.
9. **Delete replaced machinery:** the deletion test is part of each migration slice.
10. **Measure products, observe systems:** product freshness and successful alert delivery are
    promises; system health is telemetry, not persisted analytics plumbing.

## Immediate next slice

Do not port `apps/engine` and do not introduce a generic publisher or message bus for current-state
products. The acquisition proof has established the OpenRouter client, Workflow, daily archive, remote
development trigger, and telemetry. The next slice is the Cloudflare-hosted Public API V2 replacement:

1. add the shared `@orca/inventory` storage module and current inventory object;
2. make `@orca/public-api-v2` consume the shared `ModelEndpoints` standard;
3. remove its duplicated raw endpoint preparation and engine batch contract;
4. give the package its own Worker, D1 resource/migrations, pull schedule, cursor, route, and telemetry;
5. pull through `InventoryStore` and update D1 only when the source changes;
6. verify the full V2 response against the current public endpoint;
7. remove the engine V2 path while leaving the current public route and Convex implementation live;
8. inspect acquisition, refresh, and request behavior through Workflow status and Axiom logs.

This slice should not broaden into Monitor event design, generalized pipelines, API V3, or a master
catalog. Its value is that it proves the package and platform model against a real product path before
public launch; route cutover and Convex removal remain a later, explicit deletion step.

## Source material

- [`AGENTS.md`](../../AGENTS.md) — architecture reframe and project constraints
- [`notes/objectives.md`](../objectives.md) — existing product requirements and shutdown objective
- [`packages/public-api-v2`](../../packages/public-api-v2) — existing V2 transform and D1 projection
- [`notes/alchemy-layers.md`](../alchemy-layers.md) — Layer, binding, and runtime composition guidance
- [`notes/agent-observability.md`](../agent-observability.md) — Alchemy and Cloudflare inspection path
- [Alchemy file layout](../../repos/alchemy/website/src/content/docs/project-structure/file-layout.mdx)
- [Alchemy monorepo choices](../../repos/alchemy/website/src/content/docs/project-structure/monorepo.mdx)
- [Alchemy schemaless RPC](../../repos/alchemy/website/src/content/docs/cloudflare/apis/schemaless-rpc.mdx)
- [Alchemy Workflows](../../repos/alchemy/website/src/content/docs/cloudflare/compute/workflows.mdx)
- [Alchemy Queues](../../repos/alchemy/website/src/content/docs/cloudflare/messaging/queues.mdx)
