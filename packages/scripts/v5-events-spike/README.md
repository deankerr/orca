# V5 events spike

Checks that the V5 field declarations translate complete entities and stored Events: complete rows
must reproduce the deployment's V5 snapshot, and stored UPDATEs are translated into Contract field
changes with their unresolved fields, curated-out source paths, and failures counted.

Run it on a deployment whose code matches the checkout, from `packages/backend`, with exports in an
empty directory outside the repository:

```sh
dir=/tmp/v5-spike
bunx convex run products/v5/catalog:snapshot '{}' > "$dir/snapshot.json"
for table in endpoints models providers stats; do
  bunx convex data "catalog_current_$table" --limit 8000 --format jsonArray > "$dir/$table.json"
done
bunx convex data catalog_events --limit 5000 --order desc --format jsonArray > "$dir/events.json"
bun run --cwd ../scripts v5-events-spike "$dir"
```

- `events.json` supplies endpoint Events; the latest rows are almost all endpoint changes.
- `model-events.json` and `provider-events.json` hold one entity kind's Events, which `convex data` cannot filter.
- Read those through the `by_entity_kind_and_entity_id_and_scan_at` index with a temporary internal query.
