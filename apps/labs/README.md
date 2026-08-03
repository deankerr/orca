# ORCA Labs

Reproducible local data experiments and product research. Labs turns replaceable upstream snapshots
into small, reusable corpora; downstream experiments consume those corpora instead of knowing the
Convex export layout.

## Build the initial clean corpus

Extract only crawl metadata and stored crawl blobs. The operation is resumable because existing ZIP
entries are not overwritten:

```bash
bun run labs snapshot extract snapshot_dependable-husky-550_1785591526028192052.zip \
  --output .labs-work/snapshot
```

Inspect metadata without decompressing any crawl:

```bash
bun run labs snapshot inspect .labs-work/snapshot
```

Clean and repack the corpus:

```bash
bun run labs corpus build .labs-work/snapshot --output .labs-work/corpora/core-v2 \
  --compression-level 1
```

The initial policy retains only traditional text endpoints and the model copies embedded in those
endpoints. Outer scope models are deliberately ignored to match the production materializer. It
drops unrelated sources such as providers, analytics, apps, and uptimes. A whole bundle is dropped
when the catalog is empty, a text-model endpoint fetch failed, or no text endpoints remain.

```text
.labs-work/corpora/core-v2/
├── shards/
│   ├── 00000.ndjson.zst
│   ├── 00001.ndjson.zst
│   └── ...
└── manifest.json
```

Each shard contains up to 256 chronological source crawls. A crawl stores models once by slug and
removes their repeated copies from endpoints. The manifest records shard ranges, sizes, digests,
dropped crawls, and the transformation configuration. The source snapshot remains immutable; the
corpus is disposable and reproducible.

Compression levels from `0` (no compression work) through `9` (smallest output) are supported. The
default is `1` for fast iteration. Use `--shard-size` to change the default of 256 and `--overwrite`
to replace an existing corpus after changing its format or configuration.

`--jobs` controls how many asynchronous snapshot blob reads may overlap; it defaults to 4. It does
not create worker threads. Gunzip, JSON parsing, cleaning, deduplication, and Zstandard compression
remain synchronous on the main JavaScript thread, so higher values primarily help storage I/O and
may increase memory without accelerating CPU work. Shards are processed sequentially and preserve
source crawl order.

For a small format or pipeline experiment, `--limit N` processes only the first N snapshot crawls.
The corpus builder writes to a temporary sibling directory and only moves it into place after every
shard and the manifest succeed.

## Build the local product database

Replay every accepted corpus crawl into the current catalog and immutable product event history:

```bash
bun run labs db build .labs-work/corpora/core-v2 \
  --output .labs-work/databases/products.sqlite
```

For a fast demonstration, process only the first few crawls:

```bash
bun run labs db build .labs-work/corpora/core-v2 \
  --output .labs-work/databases/demo.sqlite --limit 10
```

The database is built with Effect SQL into a temporary file and moved into place only after a
successful replay. Each crawl commits atomically. Re-running the command is a clean rebuild; corpus
shards remain the reproducible input.
