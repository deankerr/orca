# ORCA Labs

Reproducible local data experiments and product research. Labs preserves upstream snapshots in a
lossless raw archive. Runnable workflows are explicit programs; pure transforms and storage helpers
do not own CLI policy.

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
```

The report is the artifact index and durable summary. A later program selects the newest successful
compatible artifact by default; failed and incomplete runs are never implicit inputs. Use `--input`
with a run id, run directory, or direct artifact path to override selection.

`--label` adds a readable suffix to an automatically generated run id. `--output` selects an exact
run directory. These overrides are useful for bounded smoke runs; normal developer use should not
need paths.

## Prepare the raw archive

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

## Reports

Every artifact-producing program prints a curated summary and stores the same structured metrics in
`report.json`.
Inspect them later without writing SQL:

```bash
bun run labs snapshot report
bun run labs archive report
```

Reports include input identity and format, time ranges, sizes, compression, and job timing where
applicable. JSONL run logs retain input summaries, progress, phase timing, completion, and failure
context.
