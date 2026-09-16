# Change Event Streams

Shared change processing for Alerts and its web presentation; CES is a working title.

## Status

- Shared projection, comparison, and view consumption are implemented.
- `v3/ingest` is a simple action with a reserved call site for the future `changeStreams` consumer.
- [Raw change inspection](raw-change-stream.md) is available for admin and agent use.
- Raw inspection uses shared comparisons on demand, independently of ingestion and CES acceptance.
- Notification interpretation, persistence, publication, and delivery remain to be designed.

## Input contract

- Scan artifact identities and observation times anchor comparisons.
- Views and CES consume the same validated records and hierarchical `json-diff-ts` changeset.
- Shared projection selects models supporting both text input and text output.
- Complete before/after records supply context, including fields absent from the changeset.
- Provider selection, endpoint-associated names, and normalized context are resolved in projections.
- Pricing belongs to its endpoint; the pricing series is a view-storage concern.
- Remaining source fields are retained as broad JSON metadata without significance-based key exclusions.
- Stats are outside catalog comparison and notification processing.
- Public notification processing selects and interprets changes; raw inspection exposes the shared diff.

Implementation details: [V3 README](../../packages/backend/convex/v3/README.md).

## Destinations

| Product             | Role                                                                         |
| ------------------- | ---------------------------------------------------------------------------- |
| Endpoints Data Grid | Current catalog, updated independently of notification decisions.            |
| Raw change stream   | Exploratory comparison inspection for the owner and coding agents.           |
| Alerts              | Curated notifications delivered externally.                                  |
| Monitor             | Web rendering of the same notification payload, presented as a grid overlay. |

The Monitor name and branding are provisional. The shared notification payload is not yet defined.

## Processing requirements

- Interpret changes with entity, model, provider, catalog, and temporal context where useful.
- Allow decisions to remain unresolved and be reconsidered as context develops.
- Make intermediate reasoning inspectable, including why a change produced no notification.
- Preserve period-correct context through notification construction.
- Support historical processing without broadcasting historical alerts.
- Keep grid updates independent of whether a notification is selected or published.
- Account for sparse local artifact history, especially after pulls.

## Raw inspection and CES

- Raw inspection helps explore upstream behavior outside the focus of current ORCA products.
- Its initial experience is chronological browsing with stepwise comparison inspection.
- Explicit artifact pairs also support wider-period net comparisons and focused agent investigations.
- Ingestion records can provide navigation without restricting comparison to ingested artifacts.
- Derived comparison persistence and background preparation are unnecessary for the initial tool.
- Shared server-side preparation and local commands should compose into purpose-built investigations.
- A recomputed comparison reflects the projection code used now, rather than a historical receipt.
- Raw inspection informs CES design without defining its eventual processing units or storage model.

## Consumer independence and acceptance

- Views and CES are intended to consume shared prepared comparisons through separate module interfaces.
- Each consumer owns its detailed processing and storage without querying the other consumer's tables.
- Shared preparation owns validation and normalization; failures here can prevent both consumers.
- CES may store selected processing units before handing work to asynchronous downstream processing.
- Acceptance of a comparison and completion of downstream interpretation or delivery are distinct.
- The current ingestion record advances with the final views stats transaction and defines the clock.
- The clock marks completed ingestion, while preceding view writes can become visible incrementally.
- Raw inspection requires no change to this arrangement, including if inspection results are cached.

The eventual CES consumer needs an explicit acceptance decision: what must be durable before ingestion
advances, which failures pause progress, and how interrupted work resumes. A shared acceptance clock and
independent consumer progress remain alternatives; asynchronous downstream work alone does not decide
between them. These questions belong to CES product design rather than the raw inspection tool.

## Cases the design must handle

- Repeated small price movements that accumulate into a meaningful change.
- Oscillating prices and provider discount competition.
- Scheduled pricing activation versus changes to the authored schedule.
- Simultaneous schedule changes and other pricing movements.
- Provider-wide policy changes affecting many endpoints.
- Catalog-wide schema changes producing large batches of field changes.
- Endpoint disappearance and return, interpreted against source coverage and identity.

Pricing semantics: [presented rates and overrides](pricing.md#presented-rates-and-overrides).

## Open decisions

| Area               | Questions                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| Interpretation     | Which layers are useful, what context do they receive, and what triggers reconsideration?      |
| Intermediate state | What survives between observations, and how is the reasoning inspected?                        |
| Publication        | When is a notification fixed, and how are later corrections represented?                       |
| Persistence        | Which comparisons, intermediate decisions, and notifications need retained records?            |
| Delivery           | How are publication, external delivery, and live-event eligibility coordinated?                |
| Execution          | When does the simple ingestion action need separate progress, retry, or scheduling semantics?  |
| Acceptance         | What has each consumer durably accepted when ingestion advances, and who records completion?   |
| Failure coupling   | Should a CES acceptance failure pause views, or should consumers advance independently?        |
| Clock semantics    | Is there one shared acceptance clock or separate consumer positions, and what do products use? |
| Visibility         | Which partially written results may products expose before a comparison is accepted?           |
| Derivation changes | How should retained results distinguish changes to projection logic from upstream changes?     |

Concrete notification thresholds, waiting periods, layer models, and storage protocols remain open.

## References

- [Product objectives](objectives.md#monitor--alerts)
- [Raw change stream](raw-change-stream.md)
- [Domain glossary](../../packages/backend/convex/v3/CONTEXT.md)
