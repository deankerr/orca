# Bundle analysis

`bundle-analysis` verifies ORCA's structural understanding of every model, endpoint, provider, and
pricing record in each selected `model-endpoints-v1` bundle. It also verifies catalog identities and
derives changes between adjacent bundles.

```sh
bun run --cwd packages/scripts bundle-analysis -- 2026-08-24T14

bun run --cwd packages/scripts bundle-analysis -- \
  --all --report
```

With no bundle filter, the latest bundle in `BUNDLES_PATH` is analyzed. `--all` is required to
implicitly select the complete directory. Every model and endpoint in every selected bundle is
verified.

Categorical source fields remain open strings so new upstream values do not require an ORCA change.
Display pricing kind is closed to `schedule`, `token`, and `unit` because those values determine how
the row itself is parsed.

By default, successful verification writes no artifact. Pass `--report` to write the JSON analysis
under `OUTPUT_PATH`. One bundle produces verified states and no transitions. Multiple bundles are
ordered by `crawl_at` and produce one transition for each adjacent pair.

Schedule pricing is classified from display row kinds and override condition fields. The analysis
does not calculate active bands, interpret row precedence, or consult the current time.

Historical absence of `pricing_json` and `pricing_version_id` is retained as state. Their later
introduction is emitted as an ordinary changed source path.
