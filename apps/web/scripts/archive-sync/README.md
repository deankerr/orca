# archive-sync

Development utility for syncing daily ORCA crawl bundles from hosted deployments or local Convex dev into a disposable local cache.

## Usage

```bash
bun run archive-sync
bun run archive-sync --days 3
bun run archive-sync --days 7 --dry-run
bun run archive-sync unzip
bun run archive-sync unzip --day 2026-04-11
bun run archive-sync unzip --crawl-id 1744329600000
CONVEX_ARCHIVE_SYNC_TARGET_URL=fantastic-mosquito-881 bun run archive-sync
CONVEX_ARCHIVE_SYNC_TARGET_URL=http://127.0.0.1:3210 bun run archive-sync
```

## Behavior

- Sync stores compressed bundles under `data/<target>/archives/`.
- Sync anchors on the latest full remote bundle, then walks backward by UTC calendar day locally.
- Sync always refreshes `data/<target>/raw/latest.bundle.json` to the newest selected archive.
- `--days N` is a calendar-day cap, not a promise to find `N` available bundles.
- If a requested UTC day has no full bundle, sync reports that gap instead of silently substituting an older day.
- `unzip` writes a named JSON file like `data/<target>/raw/2026-04-11__1775910600308.bundle.json` for an already-downloaded archive.
- Unzipped JSON output is pretty-printed for easier local inspection.
- Compressed bundles are the durable local cache. Raw JSON files are disposable and can be regenerated at any time.
- Cache directories are namespaced by the resolved target, so prod, preview, and local dev data do not mix.

## Configuration

Set `CONVEX_ARCHIVE_SYNC_TARGET_URL` or pass `--target-url <target>`.

Supported target forms:

- Deployment slug: `fantastic-mosquito-881`
- Hosted Convex URL: `https://fantastic-mosquito-881.convex.cloud`
- Hosted HTTP URL: `https://fantastic-mosquito-881.convex.site`
- Local Convex dev origin: `http://127.0.0.1:3210`

Hosted Convex targets are normalized to the matching `*.convex.site` HTTP origin automatically. Local origins are used as-is.
`unzip` resolves the target the same way as `sync`, but if you omit it the command will reuse a single existing local cache automatically. If multiple caches exist, point `--output-dir` at the specific target cache directory or pass `--target-url`.
