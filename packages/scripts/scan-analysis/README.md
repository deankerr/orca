# Scan analysis

Analysis runs in the selected Convex deployment, using its configured object source.
Use the authenticated Convex CLI for JSON results; pipe the full report into the local
HTML renderer for interactive exploration. The renderer needs no source credentials.

From `packages/backend`:

```sh
# Latest scan, standalone HTML report
bun run convex run scan_analysis/index:report '{}' \
  | bun run ../scripts/scan-analysis/index.ts --output /tmp/scan-profile.html

# Inspect one model's collected data
bun run convex run scan_analysis/index:report \
  '{"scope":"collected","model":"author/model"}' \
  | bun run ../scripts/scan-analysis/index.ts --output /tmp/model-profile.html

# Exact scan, bounded JSON output for agents
bun run convex run scan_analysis/index:profile \
  '{"scanAt":"2026-10-03T00:00:00.000Z","population":"endpoints","paths":["$[*][\"quantization\"]"],"valueLimit":null}' \
  > /tmp/quantization.json
```

Use Convex CLI deployment options to select another target. `profile` returns a
bounded view; `report` returns the complete report as a JSON string, preserving
JSONPath keys that Convex objects cannot carry. The renderer consumes the CLI's
JSON-encoded string directly. Only the resulting HTML is saved.

## Interpretation

- `scope: "orca"` applies ORCA's extraction and product scope. `scope: "collected"`
  preserves collected endpoint fields and includes all collected models. Both read
  stored artifacts rather than untouched upstream responses.
- Collected scope retains endpoints with malformed provider information for inspection.
  Provider selections require an identifiable provider; model selections retain
  unattributed endpoints.
- Providers count once per identity, using the last collected body when copies differ.
- Field percentages use the containing population; array counts include repetitions.
  Numeric pricing strings remain strings. See [profiling semantics](../../json-profile/README.md).
- Pin the returned capture time for follow-up analysis so results remain comparable.
