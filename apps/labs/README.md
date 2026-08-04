# ORCA Labs

Reproducible local data experiments and product research. Labs turns replaceable upstream snapshots
into reusable corpora and product projections. Runnable workflows are explicit programs; pure
transforms and storage helpers do not own CLI policy.

See [MODULES.md](MODULES.md) for file ownership and consumers, and [CONTEXT.md](CONTEXT.md) for the
canonical pipeline glossary.

## Workspace and artifact selection

Labs uses `.labs-work` at the repository root by default. Override it globally with
`--work-dir <directory>` or set `ORCA_LABS_WORK_DIR`; the flag takes precedence over the environment.

Artifact-producing programs create a UTC timestamped run directory:

```text
.labs-work/
├── snapshots/2026-08-04T08-14-23Z-import/
│   ├── snapshot/
│   ├── report.json
│   └── run.log.jsonl
├── archives/2026-08-04T08-30-00Z-raw/
│   ├── bundles.sqlite
│   ├── report.json
│   └── run.log.jsonl
├── corpora/2026-08-04T08-42-10Z-core/
│   ├── corpus/
│   ├── report.json
│   └── run.log.jsonl
└── databases/2026-08-04T09-03-51Z-daily/
    ├── products.sqlite
    ├── report.json
    └── run.log.jsonl
```

The report is the artifact index and durable summary. A later program selects the newest successful
compatible artifact by default; failed and incomplete runs are never implicit inputs. Use `--input`
with a run id, run directory, or direct artifact path to override selection. Legacy databases under
`.labs-work/databases` may be named without the `.sqlite` extension.

`--label` adds a readable suffix to an automatically generated run id. `--output` selects an exact
run directory. These overrides are useful for bounded smoke runs; normal developer use should not
need paths.

## Build the clean corpus pipeline

Extract the newest repository-root `snapshot_*.zip`:

```bash
bun run labs snapshot extract --label production
```

The extractor retains only crawl metadata and stored crawl blobs. Specify another ZIP with
`--input <zip>`.

Import exact decompressed bundle bytes from the latest extracted snapshot into a lossless raw
archive, replacing each source gzip envelope with one independently compressed zstd BLOB:

```bash
bun run labs archive import --label raw --compression-level 1
```

The SQLite archive is append-only and ordered by crawl id. Bundle rows retain source metadata and
digests, and update/delete triggers protect raw evidence. Import verifies source sizes; the program
then decompresses and hashes every stored bundle before publishing the artifact. Use `--limit` for
a bounded experiment and `bun run labs archive report` to inspect a completed archive without
reading its payloads.

Imports are resumable at bundle transaction boundaries. After interruption, resume the newest
incomplete import with:

```bash
bun run labs archive import --resume
```

Use `--resume --output <run-directory>` to select a particular incomplete run. Resume retains the
original input, compression level, and limit, skips matching stored bundles without reading their
payloads, and fully verifies the finished archive before publishing it. Logs append to the existing
run log and the report records the new attempt number. A second resume refuses to start while the
recorded importer process is still active.

Before publication, import reconciles the stored crawl ids, source references, sizes, metadata, and
compression policy with the selected snapshot. Verification then runs SQLite `integrity_check` and
streams every payload through zstd decompression and SHA-256 validation. Numeric crawl traversal is
backed by an expression index, remains bounded to one payload, and reports progress every 500 rows.

Product processors will replay this archive directly. The cleaned corpus commands remain available
temporarily for comparison while the product database input is moved to raw bundles.

Build a clean, repacked corpus from the latest extracted snapshot:

```bash
bun run labs corpus build --label core --compression-level 1
```

The initial policy retains traditional text endpoints and the model copies embedded in those
endpoints. Outer scope models are deliberately ignored to match the production materializer. It
drops unrelated sources and whole bundles whose catalog is empty, whose text endpoint scope failed,
or which contain no text endpoints.

Each shard contains up to 256 chronological source crawls. Models are stored once by slug and their
repeated endpoint copies are removed. Compression levels `0` through `9` are supported; the default
is `1` for fast iteration. `--shard-size`, `--jobs`, and `--limit` retain their existing tuning roles.

`--jobs` overlaps asynchronous snapshot blob reads. Gunzip, JSON parsing, cleaning, deduplication,
and Zstandard compression remain synchronous on Bun's main thread. Per-shard timings in
`run.log.jsonl` make the resulting throughput visible rather than implying worker parallelism.

Diagnostic builds can select several ordered, non-overlapping regions while retaining consecutive
crawls and real multi-shard writes within each region:

```bash
bun run labs corpus build --windows 0:768,6227:640,16975:640 --shard-size 256
```

Each `offset:count` pair addresses the chronologically sorted extracted crawls. `--windows` and
`--limit` are mutually exclusive. Per-shard log records include stage work timings, process CPU,
memory, page faults, filesystem counters, and context switches; the final report rolls up stage
totals and peak RSS for quick comparison.

## Build the product database

Replay the latest compatible corpus at daily historical precision:

```bash
bun run labs db build --label daily
```

Build every accepted historical crawl when analysis requires full precision:

```bash
bun run labs db build --label full --precision full
```

The corpus remains full precision in both cases. The database records its precision and processor
version. Entities in the first selected crawl receive a `baseline` event, meaning “present at the
lower bound” rather than an observed availability transition.

The database is still a clean rebuild in this phase. Each selected crawl commits atomically, and the
finished SQLite file is published only before the run report becomes successful. Replay progress
records cumulative materialization, diff-planning, and SQL-commit timing.

## Reports and product queries

Every build prints a curated summary and stores the same structured metrics in `report.json`.
Inspect them later without writing SQL:

```bash
bun run labs snapshot report
bun run labs corpus report
bun run labs db report
bun run labs db report --json
```

Reports include input identity and format, time ranges, sizes, drop reasons, compression, current
entity counts, event distribution, top field paths, and job timing where applicable. JSONL run logs
retain input summaries, progress, phase timing, completion, and failure context.

Product queries also select the latest database automatically:

```bash
bun run labs db monitor --limit 10
bun run labs db monitor --model deepseek/deepseek-chat-v3-0324 --limit 10
bun run labs db pricing-history deepseek/deepseek-chat-v3-0324
```

Monitor filters select matching crawl ids first and still return each selected crawl's complete
event batch. Pricing History returns endpoint availability periods and sparse pricing points; `null`
represents a removed price and values never leak across disappearance/reappearance periods.
