# Archive archeology

Local, disposable tooling for the full Convex snapshot. The source ZIP remains immutable; generated
files live under `.archive-work/`, which is ignored by Git.

The export has two layers:

- table rows at `<table>/documents.jsonl`;
- gzip-compressed crawl documents at `_storage/<storage_id>`, joined to crawls by
  `snapshot_crawl_archives/documents.jsonl`.

## Prepare once

The outer ZIP adds little compression because the bulk files are already gzip streams. Extract it
once, then run every scan against ordinary files:

```bash
mkdir -p .archive-work/snapshot
unzip -q -n snapshot_dependable-husky-550_1785591526028192052.zip \
  -d .archive-work/snapshot
```

`-n` makes the operation resumable: an interrupted extraction can run again without rewriting files
already present.

## Inspect and materialize

```bash
# Verify extracted blob/table counts without reading the outer ZIP.
bun run archive inspect

# Show the latest 20 crawls, oldest to newest.
bun run archive crawls

# Decode one crawl for jq/duckdb/disposable scripts. Its gzip source stays in place.
bun run archive materialize 1765066295922

# Observe raw model/endpoint field shapes from oldest to newest. A limit is useful while iterating.
bun run archive scan 100
bun run archive scan

# Select and validate one crawl into normalized, queryable core tables.
bun run archive sqlite 1785591004186

# Rebuild deterministic current state and immutable events oldest-first.
bun run archive history 100
bun run archive history
```

```text
.archive-work/
├── snapshot/                       # complete Convex export
│   ├── <table>/documents.jsonl
│   └── _storage/<storage-id>       # gzip JSON, despite the extensionless name
└── crawls/<crawl-id>.json          # selectively decoded analysis input
```

All paths can be overridden positionally; run `bun run archive` for the complete usage. Blob
decompression is streamed, and a missing blob or crawl fails rather than becoming an empty
observation.

The schema scan includes only endpoints whose embedded model has exactly
`output_modalities = ["text"]`. It records raw field names and nesting, key-set signatures, types,
examples, and presence/type intervals without asserting one schema over the whole history. Results
go to `.archive-work/analysis/schema-observations.json`.

The first full-corpus interpretation and proposed decoder layering are documented in
[`notes/archive-archeology/schema-story.md`](../../notes/archive-archeology/schema-story.md).
The intentionally smaller product-facing scope and SQLite experiment are documented in
[`notes/archive-archeology/core-workflow.md`](../../notes/archive-archeology/core-workflow.md).
The event contract is derived from product reads in
[`notes/data-architecture/product-events.md`](../../notes/data-architecture/product-events.md).
