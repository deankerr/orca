# Area 2 Reference Implementation

**DRAFT**

- Area 2 is a local reference implementation for deriving a compact product database from OpenRouter crawl bundles.
- Area 2 is intentionally a proving ground. Keep source-specific orchestration here until a reusable boundary has been demonstrated by more than one concrete use.
- The product database is not part of `@orca/bundles`.
- Bundle mechanics that are proven independent of this projection may live in `@orca/bundles`.
- Do not couple product-db persistence to a bundle source format, archive format, filesystem layout, or capture process.
- The current supported ingestion path is unpacked bundle files. It is implemented by `process-unpacked-bundle-files.ts`.

## Terms

- A **crawl** is one complete observation of the OpenRouter catalog at a Unix-timestamp (milliseconds) crawl ID.
- A crawl ID may be serialized as a string.
- For unpacked bundles, the crawl ID is the filename stem: `${crawl_id}.json`.
- A **bundle** is the raw JSON payload for one crawl.
- An **invalid bundle** is a bundle that fails to decode, or has zero scopes.
- A **scope** is one model with its endpoints.
- A **projection** is the product database's declared interpretation of bundle history.

## Data

- Within a scope, `[model].slug` === `[endpoint].model_variant_slug`
- An endpoint cannot change to a different model.

## Product DB

- The default database location is `.labs-work/databases/${PRODUCT_DATABASE_VERSION}.sqlite`.

## Bundle Sources

- Failure to read/stream a bundle into memory, such as relating to the filesystem or network, are fatal.

## Unpacked Bundle Files

- The bundle directory is the source inventory. The processor does not require snapshot metadata, archive metadata, or a start-cursor argument.
- The processor considers only regular files matching `^\d+\.json$`.
- A matching numeric filename must be a canonical safe Unix timestamp that JavaScript can convert to a valid `Date`.

### Source Reading

- The processor inventories filenames before reading raw bundle content.
- The processor opens the product database before deciding which files need to be read.
- The product database's latest committed crawl ID is the durable ingestion cursor.
- A file at or before the latest committed crawl ID cannot advance the projection and is not read.
- Re-running against the same directory is naturally resumable because already-represented crawls are not read.
- A failed run can leave an already-committed chronological prefix; the next run resumes from the database cursor.

## Raw Bundle Decoding

- Area 2 needs only `data.models` scopes from the raw bundle envelope.
- The raw outer scope model is not authoritative for projection policy.
- Raw bundle bytes are decoded as fatal UTF-8 and parsed through an Effect schema.
- A malformed bundle envelope is invalid.
- A materialization failure in any scope makes the entire bundle invalid.
- A bundle is atomic for policy purposes: Area 2 does not persist a partially materialized bundle.
- Invalid bundles are skipped and recorded with `console.warn('skipped bundle', { crawlId, reason })`.
- A bundle that decodes and materializes but retains zero endpoints is also skipped and warned with `reason: 'no-results'`.

## Materialization

- `@orca/bundles/materialize.ts` owns raw bundle decoding into selected Area 2 core schemas.
- `materializeBundle()` accepts one raw bundle string and returns materialized scopes.
- `materializeBundle()` does not know crawl IDs, source files, product policies, sampling, or database persistence.
- A materialized scope's endpoints share the authoritative endpoint-embedded model.
- `materializeBundle()` preserves source endpoint stats for the caller to disposition.
- The unpacked-file processor strips stats while assembling the product crawl; stats do not enter the current product database projection.
- The product database owns its own product-crawl input types; it does not import types from `@orca/bundles`.

## Product Policy

- Product policy is declared in product-db metadata; product-db records the declaration but does not prove applied data obeys it.
- The current policy is:

  ```json
  {
    "outputModalities": "text-only",
    "sampleRate": "daily"
  }
  ```

- `outputModalities: 'text-only'` means the authoritative embedded model has exactly `output_modalities: ['text']`.
- A model with `['text', 'image']` is not text-only.
- A text outer scope does not make a non-text embedded endpoint eligible.
- A non-text outer scope does not exclude a text embedded endpoint.
- Projection policy is implemented in `process-unpacked-bundle-files.ts`, not in product-db and not in `@orca/bundles`.
- Future policy values should be represented by named policy values, not overloaded modality arrays.
- The policy interpreter must fail fast when a new persisted policy value has no implementation; it must not silently retain zero endpoints.
- ❓ `text-only` is the current complete semantics. Future modality policies need their own named interpretations rather than a generic array comparison.

## Bundle Assembly

- Area 2 assembles retained materialized endpoint/model pairs into one complete product crawl.
- Endpoint and model state represent a complete crawl observation, not a patch.
- Endpoint IDs are the identity used for current-state replacement and endpoint change tracking.
- Model slugs are the identity used for model current state and model change tracking.
- Final product-crawl models and endpoints are sorted deterministically by model slug and endpoint ID.
- The intended duplicate rule is last-write-wins in raw traversal order for repeated endpoint IDs and model slugs.
- ❓ Confirm whether endpoint deduplication must happen before product eligibility filtering. If the final duplicate endpoint is ineligible, retaining an earlier eligible copy would contradict strict last-write-wins semantics.

## Sampling

- `sampleRate: 'daily'` means the first usable bundle for each UTC day.
- An invalid or zero-result bundle does not consume the day's sample; the processor reads later same-day files until it finds the first usable one.
- Once a usable crawl is selected for a UTC day, later files from that day cannot affect a first-daily projection and are not read.
- The latest committed crawl also represents an already-selected daily crawl for its UTC day; later files from that day are not read on resume.
- `sampleRate: 'all'` is represented in the policy type for a future projection and would require every newer crawl.
- Sampling decisions are made before raw file reads whenever the filename and latest product-db cursor prove a file cannot contribute.
- ❓ The first-daily policy assumes the source directory preserves a complete chronological history. Decide how a future source should declare incomplete or rewritten history.

## Product Database

- Product-db is an incrementally maintained local SQLite projection.
- Product-db accepts a complete materialized product crawl and has no knowledge of bundle archives, filesystem enumeration, or capture orchestration.
- A new database creates the current Area 2 schema and metadata.
- An existing database must have the exact supported schema version and serialized policy metadata.
- There is no backward-compatible migration path for experimental product database versions.
- A product database exposes its version, declared policies, and latest crawl ID through `ProductDatabase.status`.
- `applyCrawl()` accepts a chronologically newer complete crawl.
- Reapplying the exact current crawl is a no-op.
- Applying an unseen crawl at or before the current cursor is rejected because it would make current state and immutable history diverge.
- Each accepted crawl is committed in one SQLite transaction.
- The transaction writes crawl lineage, current models, current endpoints, model changes, endpoint changes, and pricing revisions together.
- In-memory product-db state advances only after that transaction succeeds.
- Current models and endpoints are replaceable serving state rebuilt from each complete crawl.
- Model and endpoint changes are immutable event journals.

## Change Semantics

- Models and endpoints are diffed with `json-diff-ts`.
- A newly observed entity is `baseline` at the first committed crawl and `available` when it reappears after unavailability.
- A removed entity is `unavailable`.
- An extant entity with a non-empty diff is `updated`.
- Endpoint state comparison includes the endpoint and associated `model_slug`.
- Model state comparison uses the selected core model.
- Unknown upstream fields are discarded at core-schema materialization rather than entering product state or changesets.
- ❓ Endpoint ID reassignment to another model without a pricing change may need a dedicated pricing-history policy.

## Pricing Revisions

- Pricing history is a first-class Area 2 query, not a reconstruction from generic nested changesets at read time.
- `endpoint_pricing_revisions` stores a full selected pricing card for each pricing or availability transition.
- A baseline endpoint writes a `baseline` pricing revision.
- An endpoint returning after unavailability writes an `available` pricing revision.
- An unavailable endpoint writes an `unavailable` pricing revision with no pricing card.
- An endpoint update writes a `pricing` revision only when its nested changeset includes pricing.
- Route, provider-presentation, and other non-pricing endpoint changes do not create pricing revisions.
- Pricing values preserve selected source representation: token prices are decimal strings and `discount` is numeric.
- Missing price components remain distinct from zero.
- Pricing history groups revisions by endpoint ID for one model and appends an in-memory terminal point for current available endpoints.
- ❓ Confirm the intended behavior when one stable endpoint ID moves between models without a simultaneous pricing change.

## Monitor And Queries

- Monitor reads the product database version before querying it.
- Monitor and pricing history are product-shaped query modules; callers should not query product-db table layout directly.
- Query modules should use the same chronological crawl-ID ordering assumptions as ingestion.
- ❓ Confirm whether all query SQL must cast crawl IDs numerically rather than relying on fixed-width timestamp strings.

## Operational Rules

- The default product database is a local artifact under `.labs-work/`.
- Raw bundle files remain evidence; the product database is derived and may be rebuilt.
