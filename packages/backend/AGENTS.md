# packages/backend

- `shared/` runtime code used by both the convex backend and web app.
- `convex/init.ts` default export function is executed by Convex for preview environments immediately after deployment.

### crawl_id

Timestamp string identifying a snapshot (sortable, parseable to Date). Uniquely identifies archive bundles.

### Manual bundle retrieval

- Inspect archive metadata with a custom query, e.g. `bunx convex run --inline-query 'return (await ctx.db.query("snapshot_crawl_archives").withIndex("by_crawl_id").order("desc").take(20)).map(({ crawl_id, _creationTime }) => ({ crawl_id, _creationTime }))'`
- Use `--inline-query` to tailor the fields, filters, indexes, and limit for the investigation; it is sandboxed to read-only database access.
- For time-based sampling, calculate each target slot in UTC and select the closest row by `Number(crawl_id)`. Crawls may not exist at the exact requested time (for example, they may run around `:30`), so return `crawl_id`, `crawl_at`, `_creationTime`, and the distance from the target.
- See `convex/snapshots/bundles/http.ts`.
- For batch downloads, use an explicit `-o` path based on the query result’s `crawl_at` rather than relying on `-OJ`: `curl --fail --location -o "data/bundles/${crawl_at}.me1.orca.json.gz" "https://<deployment>.convex.site/bundle?crawl_id=${crawl_id}&format=true&gzip=true"`

### Validation - zod v4

- Always validate unknown data with `zod` before use.
- New: `z.codec`, `z.looseObject`, `z.strictObject`, `z.prettifyError`
- Changes: specific validators like `z.string().url` have been moved to the top level, e.g. `z.url`

### Observability

We use the Convex to Axiom log drain connector, which is configured in the Convex dashboard and not visible in project code.

- Runtime metrics with function names are captured for every execution, including on any `console.{log|warn|error}` or uncaught exception.
- Use `ConvexError` to throw errors with relevant domain data and a concise `message`.
- Do not catch server exceptions solely to log and rethrow them. Catch only to recover, translate an expected failure, or add information that observability does not already capture; uncaught mutation exceptions are logged and roll back the transaction. This does not apply to React error boundaries.

### Workflows & R2

- A process in `workflows` has been added for `analytics` and `topApps` data collection (currently unused), to store in an R2 bucket
- Once the processes have been proved in production, they will be removed from standard archive bundle

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
