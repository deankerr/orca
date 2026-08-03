# Core history reference implementation

This directory turns selected archive crawls into two rebuildable SQLite projections: latest entity
state and immutable product events.

- `diff.ts` is pure comparison policy. It canonicalizes selected values, emits one lifecycle/update
  event per entity per crawl, and records raw-path before/after field values.
- `replay.ts` owns forward state, failed-scope handling, and the SQLite transaction for each crawl.

There are deliberately no legacy patch documents, path rewrites, current-catalog enrichment, or
backward reconstruction. Events themselves update the current SQLite tables, proving that the event
stream is sufficient to reach terminal state. Metrics use a separate latest-observation table and
never enter entity comparison.

## Availability semantics

A model is product-available when at least one selected text endpoint is available. A successful
empty endpoint scope can therefore make its previous endpoints and model unavailable. A failed scope
is not evidence of upstream state: it carries the previous model/endpoints forward and emits no
lifecycle event.

## Determinism

Objects are recursively key-sorted before comparison and storage. Arrays retain order. Event ids are
SHA-256 hashes of the processor version, crawl id, entity type, and entity id. Missing object fields
are distinct from fields whose value is `null`.

Changing comparison semantics requires changing the processor version in `diff.ts`, rebuilding from
raw artifacts, and reviewing the resulting corpus statistics.

## Product-shaped queries

Monitor discovers changed crawls with `entity_events`, applying `model_slug` and `provider_name`
filters through the matching indexes, then loads a crawl's events and ordered `event_fields`.

Pricing History selects endpoint lifecycle events plus pricing fields:

```sql
SELECT e.crawl_id, e.entity_id, e.event_type, f.path, f.before_json, f.after_json
FROM entity_events AS e
LEFT JOIN event_fields AS f ON f.event_id = e.event_id
WHERE e.entity_type = 'endpoint'
  AND e.model_slug = ?
  AND (e.event_type != 'updated' OR f.path LIKE 'pricing.%')
ORDER BY CAST(e.crawl_id AS INTEGER), e.entity_id, f.ordinal;
```

The initial proof processed 1,000 real crawls into a 6.8 MB database containing 2,948 entity events
and 2,097 field changes. A 100-crawl rebuild takes about 7.3 seconds on the development machine and
independent rebuilds produce identical logical SQL dumps.
