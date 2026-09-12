# packages/backend

- `shared/` runtime code used by both the convex backend and web app.
- `convex/init.ts` default export function is executed by Convex for preview environments immediately after deployment.
- Preserving byte-level fidelity, object key order, and array order of upstream data is never a priority of ORCA.
- Top level files export the stable public interface, with implementation details concealed in modules.
- Current development focus: migration to `convex/v3/`

### Concepts

- ORCA periodically collects and stores ordered snapshots of upstream API data.
- ORCA regenerates views from snapshot data.
- These processes are independent, and a failure in one never impacts the other.
- Upstream schemas change without warning, which may pause generation of views until manually unblocked.

### Legacy `snapshot_crawl_archives` data

- `crawl_id` Timestamp string identifying a snapshot (sortable, parseable to Date). Uniquely identifies archive bundles.
- All non-model/endpoints data in early bundles (apps, analytics etc.) has been copied into cold storage.

### Observability

- Axiom Log Stream integration is enabled on the production deployment.
- `console` logs and uncaught exceptions are captured with details of the convex function.
- Per-function execution statistics, and other deployment metrics are automatically recorded.

### Exceptions

- Allow uncaught exceptions to halt workflows and rollback mutations.
- Use `ConvexError` to create our own exceptions, with relevant domain data and a concise `message`.
- Do not catch and re-throw errors.

### Convex Utilities

```ts
import { asyncMap, omit, pick, pruneNull } from 'convex-helpers'
import { literals, nullable, partial, withSystemFields } from 'convex-helpers/validators'
import { stream } from 'convex-helpers/server/stream'
import { paginationOptsValidator } from 'convex/server'
import { v, type Infer } from 'convex/values'

import { api, components, internal } from './_generated/api'
import type { Doc, Id, TableNames } from './_generated/dataModel'
import type { ActionCtx, MutationCtx, QueryCtx } from './_generated/server'
```

- Table validators can be reused as function validators, and augmented with `.{pick|omit|partial|extend}` etc.
- Aim to process data in modular and reusable pure functions without a Convex `ctx` arg.
- Thin Convex functions should compose these regular functions to achieve their goal.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
