# Catalog policy

## Retained facts

Explicit entity properties represent selected, durable domain concepts. Open metadata retains
less constrained upstream facts across the full scan history, accepting changes that have no
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
| `from_scan_at`  | First retained observation of this identity; absence means unknown.     |
| `or_created_at` | Upstream creation time, when supplied.                                  |
| `unlisted_at`   | Endpoint disappearance observed after the last retained facts.          |

Catalog's `from_scan_at` has a different meaning from the same field on an ingestion, where it
identifies the pair's predecessor. Replacements and reappearances preserve Catalog's first
observation, including an unknown value. A later update cannot establish a missing earlier date.

## Availability

Endpoint UUIDs provide continuity across temporary absences. Unlisting preserves the last
source `scan_at`; relisting replaces the facts and clears `unlisted_at`.

Model/provider record presence is distinct from serving availability. ORCA represents their
availability through associated endpoints, while retaining their own facts independently.
