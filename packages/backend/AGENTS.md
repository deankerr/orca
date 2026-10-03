# packages/backend

- Shared pure modules may live at the `convex/` root and be imported by both the backend and web app.
- `convex/init.ts` default export function is executed by Convex for preview environments immediately after deployment.
- Preserving byte-level fidelity, object key order, and array order of upstream data is never a priority of ORCA.
- `convex/catalog/`, `convex/history/` and `convex/ingestion/` own current knowledge, observation history and ingestion bookkeeping.
- `events/` owns producing and storing base entity events; `alerts/` owns their consumption.
- Backend architecture, conventions and operating commands live in `convex/README.md`; `../../docs/orca/objectives.md` is the overall todo list.
- Provider identity and endpoint-local fields follow `../../docs/orca/provider-identity.md`; endpoint labels come from endpoint `provider_display_name`, and model/provider metadata belongs to normalized entities.
- `convex/public_api/` independently maintains a frozen external contract; follow its local instructions. Its compatibility semantics must not shape other products.
- `collectors/` independently collects scans, analytics and top-apps data.
- `scan/` owns collection storage, discovery and concealed extraction through Objects. Consumers receive `Scan` or `ScanPair`; only the public API compatibility adapter loads raw entries.

### Module ownership

- Root composition (`routine.ts`, `initialize.ts`, `retry.ts`) coordinates domains; `clock.ts` supplies their shared observation horizon.
- Root `entities.ts` owns ORCA's `Model`, `Endpoint`, `Provider` and `Pricing` schemas and normalization; Events uses those schemas for captured lifecycle payloads.
- `scan/collected.ts` describes stored source entries; `scan/schema.ts` describes the `ScannedModel`, `ScannedEndpoint` and `ScannedProvider` values returned to consumers. Normalization input validators stay private.
- Root `priceMeters.ts` owns meter units and scaling; products choose their own labels, ordering and supported meters.
- Separate input/ingestion modules from output/product modules. The stored record format is their seam.
- Input modules retain facts; output modules interpret metadata for their products. Browser code consumes product fields.
- Group output code by product, including its queries, rendering, delivery and any product-owned storage.
- Keep genuinely reused implementation within the relevant domain: `alerts/shared/` serves the alert products.
- Products may compose shared behavior differently; do not introduce a generic pipeline or product registry.
- Events and Alerts establish this pattern first. Other areas can adopt it when they change.
- Alert ownership, policies and limitations live in `../../docs/events/renderers.md`.

### Concepts

- ORCA periodically collects and stores upstream scan entries.
- ORCA builds product data from scans.
- These processes are independent, and a failure in one never impacts the other.
- Upstream schemas change without warning, which may pause generation of views until manually unblocked.

### Retained legacy production data

- Legacy code and table schemas are removed. Keep production tables and archive blobs until a separate deletion decision; schema removal is not data cleanup.

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
