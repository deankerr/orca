# Scan analysis

Analysis runs in the selected Convex deployment using its configured object source. The local
HTML renderer consumes the CLI result and needs no source credentials.

Run from `packages/backend`:

```sh
# Latest scan, standalone HTML report
bun run convex run scan_analysis/index:report '{}' \
  | bun run ../scripts/scan-analysis/index.ts --output /tmp/scan-profile.html

# One model's collected data
bun run convex run scan_analysis/index:report \
  '{"scope":"collected","model":"author/model"}' \
  | bun run ../scripts/scan-analysis/index.ts --output /tmp/model-profile.html

# Exact scan, bounded JSON output
bun run convex run scan_analysis/index:profile \
  '{"scanAt":"2026-10-03T00:00:00.000Z","population":"endpoints","paths":["$[*][\"quantization\"]"],"valueLimit":null}' \
  > /tmp/quantization.json
```

Use Convex CLI deployment options to select another target. `profile` returns a bounded view;
`report` returns the full report as a JSON string because Convex object keys cannot carry JSONPath
expressions. The renderer consumes that CLI-encoded string directly; only the resulting HTML is saved.

## Interpretation

| Scope       | Population                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------- |
| `orca`      | ORCA's extraction and product scope                                                         |
| `collected` | All collected models and retained endpoint fields, including malformed provider information |

Both scopes read stored artifacts. Provider selections require an identifiable provider;
model selections retain unattributed endpoints. Providers count once per identity, using the
last collected body when copies differ.

Pin the returned capture time for follow-up analysis so results remain comparable.
