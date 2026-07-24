# @orca/capture

Layer 0 of ORCA's new data architecture: a small Cloudflare Worker + Workflow that observes the
OpenRouter API and stores exactly what it sees in R2. It interprets nothing — it is the
unrecoverable layer, so it does as close to nothing as possible.

See [notes/data-architecture](../../notes/data-architecture/README.md) for the full design.
Currently deployed to the dev stage only — this is a design/dev experiment running in shadow
alongside the existing Convex pipeline.

## What it does

Every 15 minutes a capture pass runs:

1. Fetch the model catalog (`/api/frontend/v1/catalog/models`) and store it verbatim.
2. For each listed model+variant, fetch its endpoint stats (`/api/frontend/v1/stats/endpoint`),
   ~425 requests in chunked, durable workflow steps.
3. Write one **observation** per request — scope, its own timestamp, and what happened:

```jsonc
{
  "slug": "z-ai/glm-5.2",
  "permaslug": "z-ai/glm-5.2",
  "variant": "standard",
  "at": "2026-07-23T11:13:13.906Z",
  "status": 200,
  "body": {/* verbatim response */},
}
```

Any HTTP response is data — a 404 means "this model has zero endpoints right now", not an error.
Only transport failures (after quick retries) become error records, and an error never advances
knowledge of a scope; it just leaves it stale until the next pass. There is no such thing as an
incomplete pass — the pass is a scheduling artifact, and each observation stands alone.

## Artifact layout

```
raw/<captured_at>/models.json.gz               # verbatim catalog response
raw/<captured_at>/observations/<part>.jsonl.gz # one observation per line, ~40 per chunk
raw/<captured_at>/capture.json                 # pass summary: status tally + error scopes
```

`captured_at` is an ISO timestamp (e.g. `2026-07-23T11:13:11.435Z`) — sortable, readable, and
the only identity a pass has. Everything under `raw/` is immutable and append-only; all
interpretation (canonicalization, diffing, change detection) happens in later layers that read
these artifacts and can be re-run at any time.

## Endpoints

- `POST /capture` — start a pass manually; returns `{ captured_at, instanceId }`
- `GET /capture/<instanceId>` — workflow status
- `GET /raw/<captured_at>` — deduped view of a whole pass: `models` (catalog reduced to
  slug → has-endpoints boolean), `providers` (deduped globally), and `scopes` (one entry per
  observation: the model recovered once from its embedded copies, plus its endpoints stripped
  of the model/provider copies upstream embeds in each of them). This is the interface for
  exploring a pass — the duplicate-riddled raw forms stay fetchable by filename below.
- `GET /raw/<captured_at>/<file>` — fetch one raw artifact verbatim (gunzips `.gz` for inspection)

## Operating

Managed with Alchemy — see [CLAUDE.md](CLAUDE.md) for commands, stages, and gotchas.
