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

## Metadata selection and refresh

`catalog/metadata.ts` owns top-level metadata omission lists for models, providers, and
endpoints. These lists apply before Catalog comparison and storage. An omitted field changing
alone does not rewrite a current record. Explicit entity properties are outside this policy.

This policy is independent of Scan normalization and Events: omissions neither suppress nor
create Events, and do not change `scan_analysis`. Provider omissions in `scan/provider.ts`
and the endpoint `status` exclusion in `scan/model.ts` define the shared normalized observation;
Catalog cannot restore those fields by changing its own policy.

Changing a Catalog omission list does not automatically rewrite existing records. Refresh reads
stored captures and reapplies the current normalization and metadata policy, allowing fields to
be removed or restored without altering history or replaying Events. It preserves explicit
properties, identity, first observation, and endpoint availability. When metadata changes,
`scan_at` records the selected source date.

Refresh first tries the latest accepted capture. If the entity is absent, it uses the more
recent of its Catalog source date and the last scan with endpoint membership. Membership
transitions are resolved through endpoint identity, including reassignment to another model or
provider; the closing ingestion's `from_scan_at` identifies the actual preceding capture.
Models still observed without endpoints therefore use their newer source observations.

For a disappeared model with no Listing history, Catalog's source date is a known observation,
not necessarily its final one. Finding the final endpointless observation requires searching
captures. Source loading also requires that the selected capture remains available. Refresh
reports missing entities or captures rather than replacing metadata with an empty object.

From `packages/backend`, refresh an entity against the configured deployment:

```sh
bunx convex run catalog/refresh:run '{"entity_kind":"model","entity_id":"author/model"}'
```

For bulk work, `catalog/refresh:targets` accepts `entity_kind` and Convex `paginationOpts`,
returning targets to pass independently to `run`. These are internal operator functions.
Refresh reads complete source captures per entity; this is an occasional maintenance path,
not a page-loading API. A concurrent Catalog change causes a retryable failure rather than
being overwritten. Changing policy during an in-progress bulk refresh requires rerunning
that refresh with the final policy.
