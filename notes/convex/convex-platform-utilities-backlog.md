# Convex Platform Utilities Backlog

This note captures candidate `convex/platform` utilities that could reduce repeated Convex-specific ceremony in ORCA.

It is intentionally design-only.

- No implementation details
- No commitment that all of these should exist
- No attempt to hide Convex itself

The bar for a utility here is:

- it removes a repeated inconvenience in this repo
- it preserves explicit data access and index usage
- it fits the current feature-organisation direction
- it gives us a more compact and reusable API without becoming a mini-framework

## Current Anchor

The new `defineQuerySpec` pattern establishes a useful baseline:

- keep `args` and `handler` together
- allow direct handler calls without `ctx.runQuery`
- make the exported shape pass directly into Convex function registration

The ideas below continue in that direction.

## Tier 1: Strong Candidates

### 1. `defineIndexLookup`

The most obvious next utility.

This would package the repeated pattern of:

- define args for one lookup key
- query a table by a specific index
- return `null` or a projected value
- expose the helper as a reusable spec object

API sketch:

```ts
export const getBySlug = defineIndexLookup({
  table: 'or_views_providers',
  index: 'by_slug',
  args: { slug: v.string() },
  eq: (q, args) => q.eq('slug', args.slug),
  project: createProviderProjection,
})
```

Possible variants:

```ts
export const getByUuid = defineIndexLookup({
  table: 'or_views_endpoints',
  index: 'by_uuid',
  args: { uuid: v.string() },
  eq: (q, args) => q.eq('uuid', args.uuid),
})
```

This would help clean up:

- `convex/catalog/providers/queries.ts`
- `convex/catalog/models/queries.ts`
- `convex/catalog/endpoints/queries.ts`
- `convex/changes/queries.ts`
- `convex/snapshots/shared/bundle.ts`

Why it seems good:

- the repetition is structural, not incidental
- it composes naturally with `defineQuerySpec`
- it still leaves the important database choices visible

Risk:

- if it tries to cover too many variants, it will get abstract quickly

### 2. `syncTableByKey`

This looks like the highest-payoff backend utility outside query registration.

ORCA has repeated “sync a derived table against the latest materialized set” logic:

- read all current docs
- key them by identity
- compare incoming vs existing
- insert / replace / leave stable
- optionally mark leftovers unavailable or delete them
- collect counters

API sketch:

```ts
const result = await syncTableByKey(ctx, {
  table: 'or_views_models',
  incoming: args.models,
  key: (doc) => doc.slug,
  equals: isEqual,
  onInsert: (doc) => withUpdatedAt(doc),
  onUpdate: (current, next) => withUpdatedAt(next),
  onMissingCurrent: async (current) => {
    if (current.unavailable_at !== undefined) return 'skip'
    return {
      kind: 'patch',
      value: markUnavailableAt(args.crawl_id),
    }
  },
})
```

Maybe even a simpler shape:

```ts
await syncTableByKey(ctx, {
  table: 'or_views_changes',
  incoming: args.changes,
  key: changeKey,
  mode: 'replace-missing',
})
```

This would help clean up:

- `convex/snapshots/materialize/output.ts`
- `convex/snapshots/materializedChanges/output.ts`

Why it seems good:

- these code paths are noisy and operationally important
- the current loops are correct-looking but repetitive and easy to drift
- counters and lifecycle behavior are natural utility outputs

Risk:

- needs very careful API design so callers can still express table-specific semantics

### 3. `availability` helpers

Availability is already a shared concern, but only partially captured.

Current repetition includes:

- `unavailable_at === undefined`
- filtering available rows
- partitioning available vs unavailable rows
- converting `crawl_id` into an unavailable timestamp patch
- filtering within an availability window

API sketch:

```ts
isAvailable(doc)
filterAvailable(docs)
partitionAvailable(docs)
markUnavailableAt(crawlId)
filterByAvailabilityWindow(docs, maxTimeUnavailable)
```

Possible usage:

```ts
const availableEndpoints = filterAvailable(endpoints)
await ctx.db.patch(doc._id, markUnavailableAt(args.crawl_id))
```

This would help clean up:

- `convex/catalog/shared/availability.ts`
- `convex/analysis/stats.ts`
- `convex/analysis/fields.ts`
- `convex/public_api/preview_v2.ts`
- `convex/snapshots/materialize/output.ts`

Why it seems good:

- this is a domain concept, not a generic helper fantasy
- it reduces visual noise in analysis and ingestion code

Risk:

- easy to create too many tiny helpers

### 4. `crawlId` helpers

`crawl_id` behaves like a domain primitive in ORCA, but today it is mostly “string that everyone knows is a timestamp”.

This utility could centralize that convention.

API sketch:

```ts
export const vCrawlId = v.string()

crawlIdToMillis(crawlId)
crawlIdToDate(crawlId)
crawlIdToDay(crawlId)
isValidCrawlId(value)
markUnavailableAt(crawlId)
```

Possible usage:

```ts
const timestamp = crawlIdToMillis(args.crawl_id)
const day = crawlIdToDay(change.crawl_id)
```

This would help clean up:

- `convex/snapshots/materialize/output.ts`
- `convex/analysis/changes.ts`
- `convex/alerts/dispatcher.ts`
- `convex/http.ts`
- `convex/snapshots/shared/bundle.ts`

Why it seems good:

- it makes a project convention explicit
- it would remove repeated `Number(...)` and `Number.parseInt(..., 10)`

Risk:

- if the helper remains just a thin alias over `Number`, it may not earn its keep unless paired with validation semantics

## Tier 2: Likely Useful

### 5. `softDeleteTable`

Discord subscriptions repeat “active row” behavior constantly:

- query by index and require `deleted_at === undefined`
- soft-delete by patching `deleted_at`
- duplicate active lookup patterns across channel and DM branches

API sketch:

```ts
const subscriptionsStore = defineSoftDeleteTable({
  table: 'alerts_discord_subscriptions',
  deletedAtField: 'deleted_at',
})

subscriptionsStore.activeQuery(ctx.db)
subscriptionsStore.findActiveByIndex(ctx.db, 'by_user_id', (q) => q.eq('user_id', userId))
subscriptionsStore.softDelete(ctx.db, sub._id, Date.now())
```

Or a more index-focused helper:

```ts
findActiveFirst(ctx.db, {
  table: TABLE_NAME,
  index: 'by_user_id_and_pattern',
  eq: (q) => q.eq('user_id', context.user_id).eq('pattern', pattern),
})
```

This would help clean up:

- `convex/discord/subscriptions.ts`

Why it seems good:

- high repetition in one feature module
- strong concept boundary

Risk:

- might be too local if subscriptions stay the only soft-delete table

### 6. `distinctIndexValues`

ORCA has a recurring “walk ordered index and emit distinct field values” pattern, mainly for `crawl_id`.

This is already partly enabled by `stream`, but the application shape is still repetitive.

API sketch:

```ts
const crawlIds = await distinctIndexValues(ctx, {
  table: 'or_views_changes',
  index: 'by_crawl_id',
  field: 'crawl_id',
  order: 'desc',
  limit: args.limit,
})
```

More advanced variant:

```ts
const crawlIds = await distinctIndexValues(ctx, {
  stream: stream(ctx.db, schema)
    .query('or_views_changes')
    .withIndex('by_model_slug__crawl_id', (q) => q.eq('model_slug', modelSlug)),
  field: 'crawl_id',
  limit,
})
```

This would help clean up:

- `convex/monitor.ts`
- `convex/alerts/dev.ts`
- `convex/snapshots/materializedChanges/inputs.ts`

Why it seems good:

- it is exactly the kind of helper `convex-helpers` tends to provide
- the pattern is expressive but verbose right now

Risk:

- may just be “slightly nicer stream usage” unless the API becomes noticeably simpler

### 7. Table-derived validator helpers

ORCA uses table validators as the source of truth in several places, but the reshaping is still manual.

Current examples:

- omitting `updated_at` from insert/upsert payloads
- using full-table validators as input payloads
- potential future patch validators for admin/internal tools

API sketch:

```ts
const vUpsertEndpoint = tableInput(endpointsTable, {
  omit: ['updated_at'],
})

const vEndpointPatch = tablePatch(endpointsTable, {
  omit: ['updated_at', 'uuid'],
})
```

Or:

```ts
const endpointValidators = deriveTableValidators(endpointsTable, {
  insertOmit: ['updated_at'],
  patchOmit: ['uuid', 'updated_at'],
})
```

This would help clean up:

- `convex/snapshots/materialize/output.ts`
- any future internal CRUD/admin utilities

Why it seems good:

- it reinforces the table validator as canonical source
- it reduces ad hoc validator surgery

Risk:

- could duplicate too much of what `convex-helpers/validators` already offers conceptually

### 8. `defineRefEnricher`

The change projection layer has a repeated enrichment pattern:

- look up a catalog entity
- tolerate absence
- return a smaller stable ref shape

API sketch:

```ts
const enrichModelRef = defineRefEnricher({
  load: (ctx, { slug }) => getModel.handler(ctx, { slug }),
  missing: ({ slug }) => ({ slug }),
  present: (model, { slug }) => ({
    slug,
    name: model.name,
    description: model.description,
    input_modalities: model.input_modalities,
    output_modalities: model.output_modalities,
    reasoning: model.reasoning,
  }),
})
```

This would help clean up:

- `convex/changes/projection.ts`

Why it seems good:

- keeps the “best effort enrichment” semantics consistent

Risk:

- may be too little code to justify a generic utility

## Tier 3: More Speculative

### 9. `customQuery` / `customMutation` project builders

Inspired by `convex-helpers/server/customFunctions`, but targeted at ORCA conventions rather than auth.

Possible uses:

- normalize provider slugs before handlers run
- clamp and normalize common paging/limit inputs
- attach structured logging context
- inject a catalog-aware helper bag into `ctx`

API sketch:

```ts
const catalogQuery = customQuery(query, {
  args: {
    providerSlug: v.optional(v.string()),
  },
  input: async (ctx, args) => ({
    ctx: {},
    args: {
      providerSlug: args.providerSlug ? baseProviderSlug(args.providerSlug) : undefined,
    },
  }),
})
```

This would help clean up:

- `convex/monitor.ts`
- maybe future public query surfaces

Why it might be good:

- central place for project conventions

Why it might be bad:

- could make simple queries feel magical
- ORCA does not currently have enough shared pre-processing to justify it

### 10. `defineCatalogEntity`

This is the larger-box version of the catalog query helper pattern.

Instead of only defining reusable query specs, define most of the entity module from a single object.

API sketch:

```ts
export const providers = defineCatalogEntity({
  table: providersTable,
  projection: createProviderProjection,
  queries: {
    list: {
      index: 'by_name',
      order: 'asc',
    },
    getBySlug: {
      index: 'by_slug',
      args: { slug: v.string() },
      eq: (q, args) => q.eq('slug', args.slug),
    },
  },
})
```

This would help clean up:

- `convex/catalog/providers/*`
- `convex/catalog/models/*`
- `convex/catalog/endpoints/*`

Why it might be good:

- consistent catalog modules
- obvious single ownership point

Why it might be bad:

- a lot of abstraction for only three entities
- may make each entity harder to read locally

## Maybe Better As Lint Or Codemod

Some friction may be better addressed with tooling instead of runtime helpers.

Examples:

- detect `ctx.runQuery` inside loops
- discourage standalone exported `*Args` validators where a spec helper should be used
- scaffold `defineQuerySpec` modules for new catalog entities

This would not replace the utility layer, but it could stop drift after we settle on patterns.

## Suggested Implementation Order

If we decide to build these incrementally, the most promising order looks like:

1. `defineIndexLookup`
2. `availability` helpers
3. `crawlId` helpers
4. `syncTableByKey`
5. `softDeleteTable`
6. `distinctIndexValues`

Reasoning:

- the first three are small, local, and immediately useful
- `syncTableByKey` likely has the biggest payoff, but also the most design surface
- the later ones are either more local or more speculative

## Initial Recommendation

If we want one compact next step without overcommitting, the best candidate is:

- build `defineIndexLookup`

If we want one domain utility that would reduce noise across many modules:

- build `crawlId` helpers

If we want one higher-payoff operational abstraction:

- build `syncTableByKey`
