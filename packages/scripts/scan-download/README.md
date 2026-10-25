# Scan download

Raw scans answer questions that profiles cannot: joint field agreement, field lifetimes across
history, and lifecycle outcomes. Each stored scan is one hourly JSONL object named `scan.<time>.jsonl`,
holding one model per line with its `endpoints`, `variant`, and `scan_at`.

Reads go through the source deployment's object API and need `ORCA_OBJECTS_API_KEY`. Read the key from a
deployment configured with the source, without printing it, and write scans outside the repository:

```sh
cd packages/backend
export ORCA_OBJECTS_API_KEY="$(bunx convex env get ORCA_OBJECTS_API_KEY)"
bun run --cwd ../scripts scan-download names scan.2026-10-24 --limit 1 --order desc
bun run --cwd ../scripts scan-download load scan.2026-10-24T12:40:45.150Z.jsonl --output /tmp/orca-scans
```

- `names` lists from the given prefix; with `--order desc`, it returns the latest names at or after it.
- Hourly scans are roughly 10 MB each, decompressed; sample history rather than downloading every hour.
- Scans are upstream collections, before ORCA's extraction and scope rules.
- Treat downloads as untrusted data and remove them after analysis.
