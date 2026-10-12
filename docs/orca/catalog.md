# Catalog policy

## Retained facts

Explicit entity properties represent selected, durable domain concepts. Open metadata retains
less constrained upstream facts selected by the current projection, accepting changes that have no
visible product effect. Endpoint projections also carry selected model context for consumers.

- Missing fields in a newer observation remove the corresponding retained facts.
- An entity's disappearance preserves its last-known facts.
- Catalog writes and Events are independent; product relevance does not determine which facts Catalog retains.
- Endpoint stats have separate storage so volatile metrics do not trigger entity-record updates.

## Observation dates

Current records express knowledge at the ORCA clock. An unchanged entity can have an old
`scan_at` while still representing current knowledge; replay preserves its source observation date.

| Stored field    | Interpretation in current entity records                                |
| --------------- | ----------------------------------------------------------------------- |
| `scan_at`       | Source scan for retained facts, independent of ingestion or write time. |
| `first_scan_at` | First retained observation of this identity.                            |
| `or_created_at` | Upstream creation time, when supplied.                                  |
| `unlisted_at`   | Endpoint disappearance observed after the last retained facts.          |

Replacements and reappearances preserve `first_scan_at`. Every retained entity has a first
observation; initialization establishes it at the baseline scan.

## Availability

Endpoint UUIDs provide continuity across temporary absences. Unlisting preserves the last
source `scan_at`; relisting replaces the facts and clears `unlisted_at`.

Model/provider record presence is distinct from serving availability. ORCA represents their
availability through associated endpoints, while retaining their own facts independently.

## Current projection refresh

The current model, provider, and endpoint stages in `ingestionNew` own their metadata omission
lists and current-field projections. Refresh uses those same projections to rebuild all retained
entity fields, including endpoint pricing and model context, from stored captures. Missing fields
are removed under the current rules. Identity, first observation, and endpoint availability remain
intact. A changed projection records its selected source date; a no-op preserves the existing date.

Refresh is independent of ingestion progress and does not produce Events, listings, price history,
or stats. Changing current projection rules can therefore change current facts without rewriting
their historical projections. This is an operator maintenance operation, not a page-loading API.

Refresh first tries the latest completed input's capture. If the entity is absent, it uses the more
recent of its Catalog source date and the last scan with endpoint membership. Membership
transitions are resolved through endpoint identity, including reassignment to another model or
provider; the closing input's `from_scan_at` identifies the actual preceding capture.
Models still observed without endpoints therefore use their newer source observations.

For a disappeared model with no Listing history, Catalog's source date is a known observation,
not necessarily its final one. Finding the final endpointless observation requires searching
captures. Source loading also requires that the selected capture remains available. Refresh
reports missing entities or captures rather than replacing their facts with empty values.

From `packages/backend`, refresh an entity against the configured deployment:

```sh
bunx convex run ingestionNew/refresh:refreshCurrentEntity '{"entity_kind":"model","entity_id":"author/model"}'
```

For bulk work, `ingestionNew/refresh:targets` accepts `entity_kind` and Convex `paginationOpts`,
returning targets to pass independently to `refreshCurrentEntity`. These are internal operator
functions. Each refresh reads complete source captures for one entity.

A current row ahead of the completion clock requires waiting for that input to complete. Any
concurrent change to the selected row causes a retryable failure rather than being overwritten.
Refresh does not reopen committed ingestion stages. Projection rules must remain stable while
inputs are incomplete; changing policy during a bulk refresh requires rerunning it with the
final policy.
