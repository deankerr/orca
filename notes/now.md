# now

@data-architecture/current-view-slice.md

## @orca/schemas

- transitional, web app compatible `orca-legacy.ts`, `product.ts`, `product-to-legacy.ts`

## @orca/bundles

- `materialize.ts` converts orca bundles to usable form

## @orca/labs

- analyse historical data
- develop bulk data and product storage strategies
- evidence based decisions

#### bundle archive

- bundles from convex re-compressed and stored in a db
- todo: incremental update support
- bun, bun:sqlite, effect
- invalid bundles should not be used:
  - "empty" (no models/endpoints)
  - has fetch error
- schema coverage similar to existing production scope - text output/llms only `output_modalities = ["text"]`

#### product db

- processed historical data
- todo: incremental update support
- historical data doesn't need sub-hour updates. sampling e.g. daily still generates change events
- provider entities excluded

### @orca/engine

- initial new capture system attempt
- cloudflare, alchemy, effect
- utilise cloudflare fully before invent our own things

## Background

- The vast majority of changes between snapshots are endpoint pricing updates (excepting embedded telemetry `stats` fields).
- `pricing_json` and `display_pricing` are relaively new fields, so the focus is on the basic `pricing` field.
- Many other current fields have been added (or made required) over time.
- Early snapshots did not always properly handle transient fetch failures, which causes an endpoint to appear temporarily missing under a naive interprtaion of the endpoint record diffs.
- Early snapshots also store additional data beyond models and endpoints - to be ignored for now.
- Alchemy/Effect should be used from new Cloudflare stack code.
  - This excludes legacy Cloudflare use in `apps/logos` and `packages/backend`
