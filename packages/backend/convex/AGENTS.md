# ORCA Backend

## Concepts

- MEPs = Models, Endpoints, Providers
- Top level files export the stable public interface.
- `public_api` is completely self-contained, and never impacted by changes to backend code.
- Catalog entity queries deliberately scan the bounded `views` tables. These tables have a controlled, low number of rows, and Convex's automatic query caching keeps repeated reads cheap while their dependencies are unchanged.
- `defineQuerySpec` creates reusable functions that can be called directly via `.handler` and dropped into Convex functions like `query`.

## Core Principles

### 1. Derived State is Disposable

ORCA stores snapshots as the source of truth and treats processed views as rebuildable outputs.

- Projections can be dropped and regenerated.
- Processing should be idempotent.
- Recovery should prefer regeneration over complex repair.

### 2. External Data Will Change

OpenRouter and the model ecosystem will keep shifting.

- APIs and schemas will change without notice.
- Models and endpoints may appear, disappear, or return.
- We optimize for adaptability, not rigid stability.

### 3. Time Matters

All backend state is tied to snapshots.

- Missing data can mean an entity became unavailable.
- Entities may disappear temporarily, not just permanently.
- Historical state should be reconstructable from snapshot data.

### 4. Degrade Gracefully

Individual failures should not take down the pipeline.

- Partial progress is acceptable.
- Bad records should be isolated where possible.
- Failures should be visible in logs and outputs.

### 5. Think in Projections

User-facing data is a projection of stored snapshot data.

- Different views can exist for different consumers.
- Projection code should stay separate from source preservation.

# Convex

- Use camelCase filenames without hyphens for Convex modules.

## Utilities

```typescript
import { asyncMap, omit, pick, pruneNull } from 'convex-helpers'
import { literals, nullable, partial, withSystemFields } from 'convex-helpers/validators'
import { paginationOptsValidator } from 'convex/server'
import { v, type Infer } from 'convex/values'

import { api, components, internal } from './_generated/api'
import type { Doc, Id, TableNames } from './_generated/dataModel'
import type { ActionCtx, MutationCtx, QueryCtx } from './_generated/server'
```
