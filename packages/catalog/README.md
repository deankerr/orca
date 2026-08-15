# `@orca/catalog`

Isolated catalog acquisition and publication package for the new architecture.

The package currently provides:

- the `@orca/openrouter` reader as an independent upstream source;
- a Cloudflare Workflow that reads and publishes one inventory using a durable task;
- the shared `@orca/inventory` module for replace-in-place current data and its coarse daily archive;
- an hourly Worker trigger, an authenticated manual trigger, and a `/runs/:runId` Workflow status
  route.

The Workflow uses Cloudflare's generated instance ID as an operational `runId`. It is returned by the
manual trigger and used for status lookup and telemetry, but it is not embedded in the inventory or
archive.

## Commands

```bash
bun run --cwd packages/inventory deploy
bun run --cwd packages/catalog dev
bun run --cwd packages/catalog deploy
bun run --cwd packages/catalog trigger
```

Deploy `@orca/inventory` for the same Alchemy stage first. Catalog uses its shared
`InventoryStore.layer`; it does not define R2 buckets, object keys, or inventory codecs itself.

Set `CATALOG_API_KEY` in `packages/catalog/.env` before deploying. Alchemy binds it to the
Worker as a config secret, while Bun loads the same value for `trigger`. The command takes no
arguments: it reads the current default stage's Worker URL from Alchemy's persisted stack output,
then calls the authenticated update endpoint. Set `STAGE` or `ALCHEMY_PROFILE` in the env file
when using something other than Alchemy's defaults.

## Telemetry

The deployed Worker exports its Effect logs directly to a stage-local Axiom OTEL logs dataset.
Alchemy provisions the dataset and a least-privilege ingest token, then binds the endpoint and
secret bearer to the Worker. Each stage uses `orca-catalog-<stage>-logs` with seven-day retention;
these operational records are never written to catalog product state or the R2 archive.

Before the first deploy, connect Axiom to the active Alchemy profile with `alchemy login` (or set
`AXIOM_TOKEN`, with `AXIOM_ORG_ID` when required). Then deploy normally.
