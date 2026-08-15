# `@orca/inventory`

Shared ORCA inventory format and storage module.

`InventoryStore.publish` writes one usable inventory to both:

- `models/current.json`, replaced after every successful read;
- `models/archive/YYYY-MM-DD.json.gz`, replaced coarsely within each UTC day.

`InventoryStore.current` conditionally reads the current object using its R2 ETag. Object paths,
encoding, compression, and R2 response handling are private to this package, so Cloudflare consumers
all use the same behavior.

The `OrcaInventory` Alchemy stack owns only the lifecycle of the shared `Data` bucket. Deploy it for a
stage before deploying Workers that provide `InventoryStore.layer`:

```bash
bun run --cwd packages/inventory deploy
```

The `models/` namespace is the OpenRouter model inventory area of the shared bucket. Other OpenRouter
datasets can use their own top-level namespaces if legacy or future storage is consolidated into it.
