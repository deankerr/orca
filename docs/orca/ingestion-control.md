# Ingestion control design

This design is in progress. Confirmed requirements are separate from unresolved choices;
this document does not describe shipped functionality. Current behavior is documented in `ingestion.md`.

Shipped so far: both workers, sync kickoff, the ingestion cron, retry of one or all failed records,
preview initialization, Discord scheduling on completion, and the `/admin/ingestion` dashboard.

- ⚠️ The cron's enabled setting is still `ORCA_INGESTION_CRON_ENABLED`, not deployment-local database state.

## Confirmed direction

The control plane manages the ingestion target and can invoke ingestion. The register worker and
queue worker are independent mechanisms with their own simple loops; combining them would be a performance
optimization. The same core must serve production automatic ingestion, preview initialization, and
development deployments with a selectable range whose end can advance.

- Each administrator dashboard manages only its own deployment and has no knowledge of other deployments.
- The target beginning may move earlier, or later only while no registration reads a scan before it.
- Reducing the target end is permitted but is not an intended operational workflow.
- Reducing the target neither removes retained output nor cancels already registered work.
- Defer removal, replacement, reprojection, and moving the target start past registered work beyond the first slice.
- Derive progress from retained state instead of maintaining redundant progress markers.
- Resume interrupted register and queue workers on their next invocation; automatic restart is not a worker requirement.
- Deliver a complete vertical slice before adding advanced capabilities.

## First vertical slice

An administrator selects a development deployment's range, starts sync, observes ingestion progress,
inspects a failed pair, requests its retry, and verifies the resulting data in ORCA. The same flow
supports extending the target. Production automatic invocation and preview initialization follow
using the same core. Discord delivery is a later integration.

The first dashboard exposes separate Save target, Mark for retry, and Run sync actions. Retry
selection supports one failed pair or all failed pairs. Pending retry requests are visible before kickoff.

## Recovery and continued progress

The dashboard requests a retry by changing a failed pair to `pending`. The queue worker reads the
pair registry and enqueues eligible work independently of the target. The dashboard does
not enqueue individual ingest jobs directly. Successful process output is retained during retries.

The register worker identifies missing pairs; the queue worker identifies registered pending work.
Pending pairs remain eligible even when their scan times lie beyond a subsequently reduced target end.
Queued pairs remain entrusted to Workpool; failed pairs wait for an explicit retry request, and complete
pairs retain their output. Registering new pairs alone is not sufficient implementation of sync.

Workpool retains its existing automatic retries for thrown action errors. Individual process failures
require an explicit retry request; there is no additional automatic retry policy for those failures.

Later pairs continue processing after an earlier failure. Historical projections can be produced in
any order. Existing product readiness rules, including the completed-prefix clock, can adapt to the
core design; they do not determine ingestion order. The dashboard must distinguish current-view
progress from historical coverage rather than treating the latest completed pair as full coverage.

| Distinction       | What it establishes                                                                 |
| ----------------- | ----------------------------------------------------------------------------------- |
| Registration      | Which source inputs are selected.                                                   |
| Completion        | Which contributions are retained, including empty results.                          |
| Product readiness | Any product-specific decision to expose or qualify results using outside knowledge. |

## Automation and worker ownership

Target edits, retry requests, and kickoff are separate Convex operations. The UI can invoke an edit
followed by kickoff or leave kickoff to the operator. Editing intent does not implicitly invoke sync.
The register worker reads the target; the queue worker reads pending intent from the pair registry.
Each worker can run independently, and target edits apply to the next register cycle.

Scan collection is a separate system by policy. A production ingestion cron runs shortly after the
scheduled scan collection time and invokes ingestion independently of whether a new scan exists.
Collection neither triggers ingestion nor changes its target. Some existing environment-based
operational controls will move into deployment-local database state; the exact controls remain open.

Continuous ingestion uses an ordinary far-future target end, such as a date in 2099. A deployment-local
database enabled setting controls whether the ingestion cron invokes sync. Automatic invocation uses
the same workers without advancing the target. There is no separate target mode or special date interpretation.
Disabling automatic invocation leaves manual kickoff available and existing jobs running.

Preview initialization sets the target to the interval from now minus 24 hours through now, using the
same captured instant for both bounds. The initial lookback duration can come from an environment
variable. Its name and units, repeated initialization behavior, and preview automation defaults remain open.

Loop invocations take no work instructions as arguments; they read current database intent.
Redundant invocations are acceptable and must stop without scheduling a continuation when no work
is available. Ingest jobs run independently beyond the enqueue boundary. Repeated execution advances
work toward terminal state without replacing completed output; reopening failed work requires
explicit manual intervention. Kickoff deduplication is not required.

## Independent mechanisms

The register worker loads source scan information and records missing pairs as pending. The queue worker owns
the pending-to-queued transition for both new pairs and manual retries. Durable pending records
bridge interruption between these mechanisms. Each loop reads its own instructions and progress,
makes bounded progress, and becomes idle when it has no work.

`ingestion-workers.md` owns the proposed logical steps and decision charts, including forward-first
priority, current scopes, baseline placement, resumption from the registry, and edge-only registration.
The target is a required input that clips source query results.

Enqueue and the transition to queued commit atomically. A continuation, when needed, can commit
with the corresponding loop's progress. Neither mechanism waits for all ingest jobs to finish.
Action versus mutation and component selection are implementation details to resolve after the flow.

Batch Worker is a candidate for the queue worker: its work query selects pending rows, and its worker
mutation enqueues ingest jobs and marks those rows queued. It is currently a transitive Workpool
dependency. Its query/mutation interface cannot directly perform remote source listing; that portion
of registration requires an action.

An empty pending query establishes queue worker idleness. Registration is caught up when there are no
more available source scans within the target, not when a pair equals the literal target end. The end
can fall between captures or be in 2099. A new source check is needed to establish available coverage.

## Projection assignments

`projections/model.md` and its per-table documents own the proposed projection semantics, including
initial state, extension in both directions, reads, and withdrawal. The control plane assigns those
responsibilities to retained work through the queue worker, without inspecting current entity contents.

No record has a special position. A baseline supplies complete state at the earliest scan, so every
current view is eventually complete without depending on any one pair. A full current-entity scope
makes the view complete sooner and lets backfill commit departures only.

Only a complete full pair justifies departures only. A newer pair committed with changes scope may
omit an unchanged entity whose earlier change is unfinished, so it cannot stand in for a full pair.

Current stats receive a full-snapshot assignment for the latest registered record at queue selection.
A skipped older snapshot is covered by that retained newer obligation, including when its eventual
snapshot is empty. Pending or failed newer work is still owed; skipping older work does not make the
new snapshot available. Skipping current stats never skips the source's stats-history readings.
A source listing alone cannot own work that has not been registered.

## Withdrawal coordination

A withdrawal changes which contributions remain eligible. Accepted work must not reinstall
excluded output after withdrawal; conditional replacement of current rows alone does not prevent that.
An explicit extension can introduce the same inputs again after withdrawal.

Current-entity restoration belongs in a resumable repair job: a withdrawn winner may require a
backward source search to recover an earlier listing period. The job supplies replacement evidence
to the table's withdrawal operation. Neighbouring scans can resolve some identities immediately;
others require a search through the remaining source evidence. The table rules are in
`projections/current-entities.md`.

- Interior insertion illustrates replacement semantics; it is not a requested control-plane feature.
- Whether to cancel or invalidate stale work remains an implementation decision.

## Decisions to resolve

The design proceeds from operating scope to behavior, then to delivery order.

| Decision branch        | Questions to settle                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| Cycle                  | Mapping logical workers to execution                                                                   |
| Automation             | Database enabled setting, lookback configuration, and preview automation defaults                      |
| Projection storage     | Fields and indexes for dated values, baseline times, and current ownership; grouping a record's output |
| Recovery               | Repair of missing completion bookkeeping and reopening withdrawn process output                        |
| Visibility             | Progress, failure detail, product readiness, and operator feedback                                     |
| Advanced operations    | Earlier history, target rewind, reprojection, reset, cancellation, and stale work after withdrawal     |
| Operational guarantees | Concurrent requests, interrupted runs, access control, and audit needs                                 |
| Delivery sequence      | Dependencies, live verification scenarios, and deliberately deferred limitations                       |

Only settled domain terms belong in `GLOSSARY.md`. Record an ADR when a settled choice involves
a consequential trade-off whose rationale would otherwise be lost.
