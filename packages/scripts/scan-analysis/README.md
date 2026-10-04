# Scan analysis

Fetch one stored scan into memory and explore its models, endpoints and providers in a standalone
HTML report. Only the report is saved. No dev backend or local scan archive is required.

Provide `ORCA_OBJECTS_SOURCE_DEPLOYMENT` (a deployment name) and `ORCA_OBJECTS_API_KEY` through the
environment. `--source` overrides the deployment. Credentials never enter the report. Source
selection is explicit; a dev deployment's configured source override is not followed by the remote
Objects interface.

```sh
# Latest scan, HTML by default
bun run --cwd packages/scripts scan-analysis

# An exact capture time; compact JSON view for agents
bun run --cwd packages/scripts scan-analysis -- \
  2026-10-03T00:00:00.000Z --format json --output /tmp/scan-profile.json

# Inspect one model in the collected population
bun run --cwd packages/scripts scan-analysis -- \
  --scope collected --model author/model --output /tmp/model-profile.html

# Full value detail for a field, retaining the same scan timestamp for follow-up work
bun run --cwd packages/scripts scan-analysis -- \
  2026-10-03T00:00:00.000Z --format json --population endpoints \
  --value-limit all --paths '$[*]["quantization"]' --output /tmp/quantization.json
```

Latest selection requires the source to support descending Objects discovery. It reads one name
and downloads one complete scan; exact-time selection skips discovery. Model/provider filters run
after download. Authentication, missing scans and invalid data fail without creating a report.

Default filenames include a unique invocation ID so separate selections keep separate reports.
An explicit `--output` replaces that path only after a complete temporary file has been written.

## Populations and interpretation

- `--scope orca` (default) reuses ORCA's current scan extraction, including product scope and
  provider identity rules. `--scope collected` retains endpoint source fields and includes all
  collected models. Both describe collected artifacts, not untouched upstream responses.
- Models are counted by model identity, endpoints by UUID, providers once by provider identity.
  Repeated embedded provider bodies use the last collected body, matching ORCA assembly.
- Collected scope keeps endpoints with missing or malformed `provider_info` so those observations
  remain inspectable. Only provider bodies with a string `slug` contribute provider identities;
  unattributed endpoints remain in model selections but cannot match a provider filter.
- `--model` and `--provider` match exact identities. A provider filter selects models with matching
  endpoints; a model filter selects its related providers. Unfiltered models include those with
  no endpoints. Duplicate model/endpoint identities fail rather than silently changing counts.
- Field presence/null percentages use the containing population. Array-item rows count occurrences,
  not entities supporting a capability. See [JSON profile](../../json-profile/README.md).
- Numeric summaries use weighted nearest-rank quantiles of JSON numbers. Numeric strings, including
  pricing meters, are not coerced. These are distributions of observed field values, not aggregate
  request latency/throughput percentiles or interpreted price comparisons.
- Examples retain up to three distinct primitive values with their entity identities. They are
  examples, not a representative sample or a cross-field correlation index.

The HTML viewer searches field paths, sorts by absence or distinct values, and expands distributions
on demand. It shows the 50 most frequent values per branch; JSON export retains every value.
Exported reports include observed data and can be large when fields have many unique values.

CLI JSON output uses the generic profiler's flat view: five entries per distribution by default,
with explicit omitted counts. `--population`, `--paths` and `--value-limit` refine that view after
the full profile has been computed. These view options apply to JSON output; HTML retains full
detail for interactive exploration. The JSON view omits entity examples; those remain in the
full report and HTML export.

## Run inside a deployment

The internal action `scan_analysis/index:profile` uses the same full profiler and view as the CLI.
It loads one scan through the deployment's configured Objects source, without saving scans or
reports. No API key is supplied in action arguments. Access uses Convex's administrative tooling.

```sh
# Once this action has been deployed through the normal release process:
bunx convex run --prod scan_analysis/index:profile '{}'

# Drill into the exact capture time returned by the first call:
bunx convex run --prod scan_analysis/index:profile \
  '{"scanAt":"2026-10-03T00:00:00.000Z","population":"endpoints","paths":["$[*][\"quantization\"]"],"valueLimit":null}'
```

Run these commands from `packages/backend`. Arguments also accept the same `scope`, `model` and
`provider` selection as the local CLI. Omitted `scanAt` selects the latest scan. Pin the returned
timestamp for follow-up calls so observations remain comparable. The reported source deployment
is the Objects source, which may differ from the deployment executing the action.

For an ad hoc analysis, compose `createObjectReader`, `loadScan` and ordinary TypeScript functions.
Keep additional statistics specific to the question. Date-range pooling and historical comparisons
are intentionally deferred.
