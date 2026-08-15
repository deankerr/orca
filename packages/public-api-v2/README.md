# `@orca/public-api-v2`

Standalone legacy V2 projection and Cloudflare Worker.

Catalog publishes one complete normalized `Inventory` through the shared `@orca/inventory` module.
This Worker polls it through the same `InventoryStore` Layer, maps its `ModelEndpoints` into the V2
response, and switches a package-owned D1 database to the completed source ETag. Public requests read
only D1, so catalog availability and refresh failures do not affect the serving path.

The Worker is currently deployed for parallel validation only. The public route on `orca.orb.town`
continues to use Convex until a separate cutover is approved.

## Commands

```bash
bun run --cwd packages/public-api-v2 test
bun run --cwd packages/public-api-v2 dev
bun run --cwd packages/public-api-v2 deploy
```

Deploy `@orca/inventory` for the same Alchemy stage first so the shared `Data` resource reference can
resolve. Catalog is a producer, not a deployment dependency of this Worker. The Worker serves
`GET /api/preview/v2/models` on its Alchemy URL and refreshes every five minutes.
