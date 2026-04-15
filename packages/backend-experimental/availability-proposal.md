# Availability Proposal

This note captures a simpler proposal for handling current availability in the
experimental backend.

## Goal

Keep catalog state and availability observations as separate concerns.

- Catalog tables answer: what do we know about this entity?
- Availability observations answer: when did we look for this entity, and did
  we find it?
- A small projection field on the leader table answers the hot-path query:
  should this entity currently be treated as unavailable?

For now, only endpoints need the projected `unavailable_at` field because the
frontend hot path is "list currently available endpoints".

## Core Model

### 1. State streams

Use the existing `catalog_versions` pattern for deduped state streams where we
only want to append a row when canonical content changes.

Examples:

- `model.base`
- `provider.base`
- `endpoint.base`
- `endpoint.pricing`

These streams are:

- deduped by content hash
- append-only
- version-based

### 2. Observation streams

Add a second generic primitive for observations where repeated identical values
are meaningful evidence.

Examples:

- `endpoint.availability`
- later, maybe `model.availability`
- later, maybe `provider.availability`

These streams are:

- not content-hashed
- not deduped by default
- append-only
- time-ordered

The simplest possible availability value set is:

- `available`
- `unavailable`

## Proposed Tables

### `catalog_versions`

Keep as-is for state streams.

```ts
defineTable({
  scope_table: v.string(),
  id: v.string(),
  first_seen_at: v.number(),
  version: v.number(),
  source: v.object({
    locator: v.string(),
    storageId: v.optional(v.string()),
  }),
  content_hash: v.string(),
})
```

### `catalog_observations`

New generic table for observation streams.

```ts
defineTable({
  scope_table: v.string(),
  id: v.string(),
  observed_at: v.number(),
  name: v.string(),
  value: v.string(),

  source: v.object({
    locator: v.string(),
    storageId: v.optional(v.string()),
  }),
})
  .index('by_scope_table__id__name__observed_at', ['scope_table', 'id', 'name', 'observed_at'])
  .index('by_name__value__observed_at', ['name', 'value', 'observed_at'])
```

Notes:

- For v1, `value` is just `'available' | 'unavailable'`.
- This table is intentionally generic and does not try to encode endpoint-only
  lifecycle semantics.

### `catalog_endpoints`

Add one mutable projection field:

```ts
unavailable_at: v.optional(v.number())
```

This field means:

"This endpoint is currently considered unavailable for user-facing endpoint
queries."

It does not mean:

- deleted
- permanently gone
- historical truth

It is only the current read-model signal.

Suggested additional index for the hot path:

```ts
.index("by_unavailable_at__uuid__first_seen_at", [
  "unavailable_at",
  "uuid",
  "first_seen_at",
])
```

This supports:

- `eq("unavailable_at", undefined)`
- latest-per-uuid scans over available endpoints

## Write Rules

### State ingestion

Continue to ingest model/provider/endpoint state exactly as now:

- normalize input
- bump `catalog_versions` for the relevant table
- only insert a new base/pricing row when content changed

### Availability observations

The collection service records observations separately from state ingestion.

For endpoint availability:

- write `available` when:
  - the endpoint is first observed, or
  - the latest availability observation for that endpoint was `unavailable`
- write `unavailable` when:
  - a successful scope fetch looked for a known endpoint and did not find it

Do not write repeated steady-state `available` rows.

Repeated `unavailable` rows are allowed if we want them as evidence. That policy
can be decided per writer without changing the schema.

## Pseudocode

### Ingest endpoint state

```ts
for (item of items) {
  const { endpointRecord, endpointPricingRecord } = parse(item)

  bumpVersion('catalog_endpoints', endpointRecord.id, endpointRecord)
  bumpVersion('catalog_endpoint_pricing', endpointPricingRecord.id, endpointPricingRecord)
}
```

### Reconcile endpoint availability for one successful model scope

Assume the collector successfully fetched all endpoints for one model scope and
we have the observed UUID set.

```ts
function reconcileEndpointAvailability({ modelSlug, observedUuids, at, source }) {
  const knownEndpoints = getLatestEndpointsForModel(modelSlug)

  for (endpoint of knownEndpoints) {
    const latest = getLatestObservation('catalog_endpoints', endpoint.id, 'availability')

    if (observedUuids.has(endpoint.uuid)) {
      if (!latest || latest.value === 'unavailable') {
        insertObservation({
          scope_table: 'catalog_endpoints',
          id: endpoint.id,
          observed_at: at,
          name: 'availability',
          value: 'available',
          source,
        })
      }

      clearUnavailableAt(endpoint.uuid)
      continue
    }

    insertObservation({
      scope_table: 'catalog_endpoints',
      id: endpoint.id,
      observed_at: at,
      name: 'availability',
      value: 'unavailable',
      source,
    })
  }
}
```

### Project observations onto `unavailable_at`

This can run as a cron or internal maintenance function.

```ts
function projectEndpointAvailability({ now, thresholdMs }) {
  const candidates = getLatestUnavailableObservations('catalog_endpoints', 'availability')

  for (observation of candidates) {
    const latest = getLatestObservation('catalog_endpoints', observation.id, 'availability')

    if (!latest || latest.value !== 'unavailable') {
      continue
    }

    if (now - latest.observed_at < thresholdMs) {
      continue
    }

    setUnavailableAt({
      id: observation.id,
      unavailableAt: latest.observed_at,
    })
  }
}
```

### Handle recovery

When an `available` observation is recorded for an endpoint:

```ts
clearUnavailableAt(uuid)
```

This means the projection always follows the latest availability observation,
with thresholding only applied when promoting an `unavailable` observation into
the current read model.

## Query Shape

The data grid hot path should query only currently available endpoints:

```ts
stream(ctx.db, schema)
  .query('catalog_endpoints')
  .withIndex('by_unavailable_at__uuid__first_seen_at', (q) => q.eq('unavailable_at', undefined))
  .order('desc')
  .distinct(['uuid'])
```

Then join current pricing for each UUID.

This keeps event/observation history off the hot path.

## Why This Split

This design keeps two different jobs separate:

- `catalog_versions` tracks deduped state changes
- `catalog_observations` tracks what we observed, even when repeated values are
  meaningful

Trying to force both into one table would conflate:

- "only append when canonical content changes"
- "sometimes append repeated identical values because each observation is
  evidence"

Those are different primitives and are cleaner as separate generic tables.

## Current Scope

For v1:

- add `catalog_observations`
- use it for `endpoint.availability`
- add `unavailable_at` to `catalog_endpoints`
- do not add availability projection fields to models/providers
- derive model/provider "active" state from active endpoints

This is intended as the minimum useful shape, not the final architecture.
