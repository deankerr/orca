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

# An exact capture time; JSON output for agents
bun run --cwd packages/scripts scan-analysis -- \
  2026-10-03T00:00:00.000Z --format json --output /tmp/scan-profile.json

# Inspect one model in the collected population
bun run --cwd packages/scripts scan-analysis -- \
  --scope collected --model author/model --output /tmp/model-profile.html
```

Latest selection requires the source to support descending Objects discovery. It reads one name
and downloads one complete scan; exact-time selection skips discovery. Model/provider filters run
after download. Authentication, missing scans and invalid data fail without creating a report.

## Populations and interpretation

- `--scope orca` (default) reuses ORCA's current scan extraction, including product scope and
  provider identity rules. `--scope collected` retains endpoint source fields and includes all
  collected models. Both describe collected artifacts, not untouched upstream responses.
- Models are counted by model identity, endpoints by UUID, providers once by provider identity.
  Repeated embedded provider bodies use the last collected body, matching ORCA assembly.
- `--model` and `--provider` match exact identities. A provider filter selects models with matching
  endpoints; a model filter selects its related providers. Unfiltered models include those with
  no endpoints. Duplicate model/endpoint identities fail rather than silently changing counts.
- Field presence/null percentages use the containing population. Array-item rows count occurrences,
  not entities supporting a capability. See [JSON profile](../json-profile/README.md).
- Numeric summaries use weighted nearest-rank quantiles of JSON numbers. Numeric strings, including
  pricing meters, are not coerced. These are distributions of observed field values, not aggregate
  request latency/throughput percentiles or interpreted price comparisons.
- Examples retain up to three distinct primitive values with their entity identities. They are
  examples, not a representative sample or a cross-field correlation index.

The HTML viewer searches field paths, sorts by absence or distinct values, and expands distributions
on demand. It shows the 50 most frequent values per branch; JSON export retains every value.
Exported reports include observed data and can be large when fields have many unique values.

For an ad hoc analysis, compose `createObjectReader`, `loadScan` and ordinary TypeScript functions.
Keep additional statistics specific to the question. Date-range pooling and historical comparisons
are intentionally deferred.
