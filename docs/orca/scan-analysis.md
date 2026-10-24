# Scan analysis

Scan analysis profiles the fields of one stored scan, read through the deployment's configured object source.
It persists neither source data nor reports.

- Administrators explore full reports at `/admin/scan-analysis`; Export JSON saves the complete report.
- An empty scan field selects the latest stored scan; pin the reported capture time for comparable follow-up.
- `report` returns a JSON string because Convex object keys cannot carry the profile's JSONPath expressions.

## Interpretation

| Scope       | Population                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------- |
| `orca`      | ORCA's extraction and product scope                                                         |
| `collected` | All collected models and retained endpoint fields, including malformed provider information |

- Both scopes read stored artifacts.
- Providers count once per identity, using the last collected body when copies differ.

## Bounded CLI views

`profile` returns a bounded view for agents. Run from `packages/backend`, adding Convex CLI deployment options:

```sh
bun run convex run scan_analysis/index:profile \
  '{"scanAt":"2026-10-03T00:00:00.000Z","population":"endpoints","paths":["$[*][\"quantization\"]"],"valueLimit":null}' \
  > /tmp/quantization.json
```
