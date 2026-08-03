# Product query direction

The SQLite history is an internal executable specification. Products should consume a few explicit
read contracts rather than learn the `models`, `endpoints`, `entity_events`, and `event_fields`
storage layout. These adapters are developed locally first and later implemented over the chosen
remote projection store.

This is deliberately not one grand unified product API:

```text
current models + endpoints + latest metrics
    ├── Endpoints Grid
    └── ORCA API

immutable entity events + field changes
    ├── Monitor
    ├── Pricing History
    └── live Alerts
```

## Prerequisites

Before product results are treated as correct:

1. Reject empty model catalogs without changing effective state, as documented in
   [full-history-findings.md](full-history-findings.md).
2. Give endpoint events period-valid model presentation context:

```ts
type EndpointEventContext = {
  model: { slug: string; name: string }
  endpoint: CoreEndpoint
}
```

The endpoint already carries period-valid provider organization, display, targeting, region, and
model-id values. Do not enrich historical events from latest current-view tables.

## Application read boundary

The initial local query module should expose four operations:

```ts
interface ProductQueries {
  currentCatalog(): Promise<CurrentCatalog>

  monitorPage(args: {
    before?: string
    modelSlug?: string
    providerName?: string
    limit: number
  }): Promise<MonitorPage>

  pricingHistory(args: { modelSlug: string }): Promise<PricingHistory>

  eventsForLiveCrawl(crawlId: string): Promise<ProductEvent[]>
}
```

These are product contracts, not direct SQL abstractions. Their implementation decodes canonical
JSON, groups flat rows, and hides field presence/storage details.

## Current catalog: Grid and API

Grid and API share the latest accepted catalog plus latest endpoint metrics:

```sql
SELECT
  e.id,
  e.model_slug,
  e.state_json AS endpoint_json,
  m.state_json AS model_json,
  x.p50_latency,
  x.p50_throughput,
  e.updated_crawl_id
FROM endpoints AS e
JOIN models AS m ON m.slug = e.model_slug
LEFT JOIN endpoint_metrics AS x ON x.endpoint_id = e.id;
```

Return one revisioned object:

```ts
type CurrentCatalog = {
  revision: string
  generatedAt: string
  models: CurrentModel[]
  endpoints: CurrentEndpoint[]
}
```

The Grid can initially receive the complete projection and retain client-side filtering/sorting. At
about 1,000 endpoints, server-side query machinery would add complexity without demonstrated need.

The V2 API transforms the same catalog by grouping endpoints by `model_slug` and applying its public
labels/defaults. A separately materialized API blob is optional; HTTP caching around a response
generated from the current store may be sufficient. Opt into known core gaps such as variable
pricing tiers only when required for cutover compatibility.

## Monitor

Monitor pages changed crawls newest-first. Crawl ids are millisecond timestamps with fixed-width
decimal strings, so lexical order matches chronological order.

```sql
SELECT DISTINCT crawl_id
FROM entity_events
WHERE crawl_id < COALESCE(?, '9999999999999')
ORDER BY crawl_id DESC
LIMIT ?;
```

Add `model_slug = ?` or `provider_name = ?` before the cursor predicate for filtered feeds. Existing
indexes cover all three discovery forms.

Load the selected batches in one query rather than one request per crawl:

```sql
SELECT
  e.event_id, e.crawl_id, e.entity_type, e.entity_id, e.event_type,
  e.model_slug, e.provider_name, e.provider_slug, e.context_json,
  f.ordinal, f.path, f.before_present, f.before_json,
  f.after_present, f.after_json
FROM entity_events AS e
LEFT JOIN event_fields AS f ON f.event_id = e.event_id
WHERE e.crawl_id IN (?, ?, ...)
ORDER BY e.crawl_id DESC, e.entity_type, e.entity_id, f.ordinal;
```

The adapter groups rows into:

```ts
type MonitorPage = {
  batches: Array<{
    crawlId: string
    observedAt: string
    events: ProductEvent[]
  }>
  nextBefore?: string
}
```

Field presentation is a read concern:

- presence flags distinguish added/removed/updated;
- array values may be rendered as set additions/removals when a field is semantically a set;
- labels, units, numeric deltas, and feed suppression do not alter immutable events;
- lifecycle grouping of a model and its endpoints is also a presentation transform.

## Pricing History

Read endpoint lifecycle events plus an explicit allowlist of basic pricing paths for one model:

```sql
SELECT
  e.event_id, e.crawl_id, e.entity_id AS endpoint_id,
  e.event_type, e.context_json,
  f.ordinal, f.path, f.before_present, f.before_json,
  f.after_present, f.after_json
FROM entity_events AS e
LEFT JOIN event_fields AS f ON f.event_id = e.event_id
WHERE e.entity_type = 'endpoint'
  AND e.model_slug = ?
  AND (
    e.event_type IN ('available', 'unavailable')
    OR f.path IN (
      'pricing.prompt',
      'pricing.completion',
      'pricing.input_cache_read',
      'pricing.input_cache_write',
      'pricing.input_cache_write_1h'
    )
  )
ORDER BY e.crawl_id, e.entity_id, f.ordinal;
```

Fold events forward per endpoint:

```text
available      -> start an availability period from complete event context
pricing update -> replace selected prices and emit a sparse point
unavailable    -> emit an unavailable point and end the period
available      -> begin a fresh period; never leak prices from the previous period
```

Return a directly chartable response:

```ts
type PricingHistory = {
  modelSlug: string
  since: number
  asOf: number
  series: Array<{
    availableFrom: number
    endpointId: string
    provider: { name: string; displayName: string; slug: string }
    unavailableAt?: number
    points: Array<{
      at: number
      available: boolean
      // Missing means unchanged at this sparse point; null means removed.
      pricing: Partial<Record<TrackedPrice, string | null>>
    }>
  }>
}
```

The array contains one series per endpoint availability period, not necessarily one series per
endpoint id. A reappearance starts a new item with a fresh complete pricing point.

Start by deriving this response in TypeScript from generic events. If measured reads become
expensive, add a disposable `endpoint_pricing_points` projection without changing event history.
Chart granularity/coalescing likewise belongs in this read projection.

## Alerts

Alerts consume the same product events as Monitor for one newly committed live crawl:

```sql
SELECT *
FROM entity_events
WHERE crawl_id = ?
ORDER BY entity_type, entity_id;
```

Then group lifecycle events, match subscriptions against `model_slug`, format Discord messages, and
enqueue durable delivery attempts. Historical replay writes events but never delivery work; that is
an execution-mode decision, not an alternate event shape.
