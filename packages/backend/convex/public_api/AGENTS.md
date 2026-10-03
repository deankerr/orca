# Frozen public API V2

This is an independently maintained compatibility adapter for a published contract, not a Catalog
product. Its schema is intentionally different. Do not modernize field names, defaults, nulls,
pricing quirks, modality coverage, or provider semantics to match another backend schema.
Do not add features here during unrelated work. Repair broken data retrieval, validation and
serving while preserving the contract and compatibility tests.

- `v2/schema.ts`: authoritative frozen response contract.
- `v2/compatibility.ts`: explicit source-to-contract mapping, including historical quirks.
- `v2/snapshot.ts`: builds the frozen response from the explicit `scan.loadRaw()` compatibility loader.
- `v2/cache.ts`: independent five-minute cron; skips the cached scan identity, validates before
  replacing, and prevents concurrent older refreshes from moving the cache backwards.
- `v2/table.ts`: `scan_at` is the cache key. Missing or invalid means refresh and replace.
  `scan_id` remains optional in the schema for existing rows and is unused.
- `v2/http.ts`: existing serving contract. The public Next.js rewrite targets `/public-api-preview/v2-cached`.

No Catalog imports, catalog joins, ingestion-clock dependencies, or ingestion-triggered refreshes.
The shared scan module is the only source-data dependency. Full modality coverage and
embedded provider names are required; product filtering/normalization loses published data.

This contract is legacy; this implementation is maintained. Keep these instructions and the
explanation of compatibility choices here rather than spreading API-specific rules through other products.
