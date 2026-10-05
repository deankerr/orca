# Scan analysis

Inspect a stored scan without setting up a dev deployment. Supply
`ORCA_OBJECTS_SOURCE_DEPLOYMENT` and `ORCA_OBJECTS_API_KEY` in the environment;
`--source` overrides the deployment. Only the report is saved.

```sh
# Latest scan, HTML report
bun run --cwd packages/scripts scan-analysis

# Exact scan, bounded JSON output for agents
bun run --cwd packages/scripts scan-analysis -- \
  2026-10-03T00:00:00.000Z --format json --population endpoints \
  --paths '$[*]["quantization"]' --value-limit all --output /tmp/quantization.json

# Inspect one model's collected data
bun run --cwd packages/scripts scan-analysis -- \
  --scope collected --model author/model --output /tmp/model-profile.html
```

## Interpretation

- `--scope orca` applies ORCA's extraction and product scope. `--scope collected`
  preserves collected endpoint fields and includes all collected models. Both read
  stored artifacts rather than untouched upstream responses.
- Collected scope retains endpoints with malformed provider information for inspection.
  Provider selections require an identifiable provider; model selections retain
  unattributed endpoints.
- Providers count once per identity, using the last collected body when copies differ.
- Field percentages use the containing population; array counts include repetitions.
  Numeric pricing strings remain strings. See [profiling semantics](../../json-profile/README.md).
- Pin the returned capture time for follow-up analysis so results remain comparable.

## Run inside a deployment

From `packages/backend`, use the deployment's configured object source:

```sh
bunx convex run --deployment '<deployment>' scan_analysis/index:profile '{}'
bunx convex run --deployment '<deployment>' scan_analysis/index:profile \
  '{"scanAt":"2026-10-03T00:00:00.000Z","population":"endpoints","paths":["$[*][\"quantization\"]"],"valueLimit":null}'
```
