# V4 documentation

[Implementation stages](stages.md) owns the work checklist, readiness milestones and deliberate
deferrals. Read it before expanding implementation scope. The next stage is core data refinement;
Events is fully deferred and public API compatibility is sealed until a late developer-guided session.

[V4 philosophy](v4.md) defines the model. Start a detailed review at a table below; its page keeps
the schema, field meanings, indexes and operations together.

[Entity terminology](../../CONTEXT.md) defines identity, lasting entity knowledge and endpoint listing.

## Modules and tables

| Module                            | Table or contract                                                                                                                                 | Responsibility                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| [Scan](scan.md)                   | [Artifacts](scan.md#artifact-contract), [Extraction](scan.md#extraction)                                                                          | Capture evidence and extract scoped entities        |
| [Ingestion](ingestion.md)         | [`ingestions`](ingestion.md#ingestions)                                                                                                           | Admission, progress and clock                       |
| [Records](records.md)             | [`entityRecords`](records.md#entityrecords)                                                                                                       | Full-value MEP history and contextual reads         |
| Prices                            | [`endpointPrices`](series.md#endpointprices)                                                                                                      | Retained prices and pricing-history reads           |
| Listings                          | [`endpointListings`](series.md#endpointlistings)                                                                                                  | Availability intervals and historical relationships |
| Readings                          | [`endpointReadings`](series.md#endpointreadings)                                                                                                  | Supplied performance samples and stats reads        |
| [Catalog](catalog.md)             | [`currentModels`](catalog.md#currentmodels), [`currentProviders`](catalog.md#currentproviders), [`currentEndpoints`](catalog.md#currentendpoints) | Cumulative current/last-known entities and reads    |
| [Change Events](change-events.md) | Deferred design and implementation                                                                                                                | Future interpretation and consumer publications     |
| [Projections](projections.md)     | [Shared transforms](projections.md#transform-contracts)                                                                                           | Shared product lens, selection and comparison       |

[Deployment sync](deployment-sync.md) records options for moving useful state between deployments.
See [Implementation conventions](implementation.md) for code placement, table naming and module composition.

## Review conventions

- Unmarked statements record the agreed direction; schema blocks remain proposals for review.
- **Implementation recommendation** labels a starting point to settle while writing code.
- ❓ marks a genuine unresolved question or concern.
- 🚧 marks a known intention deferred beyond the minimum implementation.
- Each detailed rule lives with its owning table or operation; other pages link to that contract.
