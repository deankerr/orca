# `@orca/public-api-v2`

Standalone legacy V2 projection and Cloudflare Worker.

Catalog publishes one complete normalized `Inventory` through the shared `@orca/inventory` module,
then this package maps it to the V2 response and replaces `models/public-api-v2/current.json` in the
same bucket. A failed or empty projection is logged and leaves the previous object in place. The
Worker serves that object on each request.

The Worker is currently deployed for parallel validation only. The public route on `orca.orb.town`
continues to use Convex until a separate cutover is approved.

## Commands

```bash
bun run --cwd packages/public-api-v2 test
bun run --cwd packages/public-api-v2 dev
bun run --cwd packages/public-api-v2 deploy
```

Deploy `@orca/inventory` for the same Alchemy stage first so the shared `Data` resource reference can
resolve. Catalog writes the V2 object; this Worker only reads it. The Worker serves
`GET /api/preview/v2/models` on its Alchemy URL.
