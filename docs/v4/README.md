# V4 documentation

[V4 philosophy](v4.md) defines the model. Start a detailed review at a table below; its page keeps
the schema, field meanings, indexes and operations together.

[Entity terminology](../../CONTEXT.md) defines identity, lasting entity knowledge and endpoint listing.

## Modules and tables

| Module                            | Table or contract                                                                                                                                 | Responsibility                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| [Scan](scan.md)                   | [Artifacts](scan.md#artifact-contract)                                                                                                            | Capture complete artifacts and load scoped inputs   |
| [Ingestion](ingestion.md)         | [`ingestions`](ingestion.md#ingestions)                                                                                                           | Admission, progress, process claims and clock       |
| [Records](records.md)             | [`entityRecords`](records.md#entityrecords)                                                                                                       | Full-value MEP history and contextual reads         |
| Prices                            | [`endpointPrices`](series.md#endpointprices)                                                                                                      | Retained quotes and pricing-history reads           |
| Listings                          | [`endpointListings`](series.md#endpointlistings)                                                                                                  | Availability intervals and historical relationships |
| Readings                          | [`endpointReadings`](series.md#endpointreadings)                                                                                                  | Supplied performance samples and stats reads        |
| [Catalog](catalog.md)             | [`currentModels`](catalog.md#currentmodels), [`currentProviders`](catalog.md#currentproviders), [`currentEndpoints`](catalog.md#currentendpoints) | Current/last-known caches and refresh               |
| [Change Events](change-events.md) | [`changeEvents`](change-events.md#changeevents)                                                                                                   | Interpretation, publication and event reads         |
| [Projections](projections.md)     | [Shared transforms](projections.md#transform-contracts)                                                                                           | Extraction, selection, hydration and comparison     |

[Deployment sync](deployment-sync.md) records options for moving useful state between deployments.
See [Implementation conventions](implementation.md) for code placement, table naming and module composition.

## Review conventions

- Unmarked statements record the agreed direction; schema blocks remain proposals for review.
- **Implementation recommendation** labels a starting point to settle while writing code.
- ❓ marks a genuine unresolved question or concern.
- 🚧 marks a known intention deferred beyond the minimum implementation.
- Each detailed rule lives with its owning table or operation; other pages link to that contract.
