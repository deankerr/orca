# packages/backend

- `shared/` runtime code used by both the convex backend and web app.
- `convex/init.ts` default export function is executed by Convex for preview environments immediately after deployment.

### Manual bundle retrieval

- Find IDs: `bunx convex data snapshot_crawl_archives --limit 1000 --format jsonLines`
- Download: `curl -o bundle_<crawl_id>.json.gz 'https://<deployment>.convex.site/archive-sync/bundle.gz?crawl_id=<crawl_id>'`

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
