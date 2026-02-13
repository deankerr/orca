# Effect Library Exploration — Crawl Pipeline Prototype

## Status: Prototype / Proof of Concept

This document captures findings from exploring the [Effect](https://effect.website/) library as a replacement for the imperative crawl pipeline.

## TL;DR

Effect is **fully compatible** with Convex actions. The prototype compiles, type-checks, and mirrors the existing crawl logic using Effect's patterns. The main question isn't "can we?" but "should we?" — and for what scope.

## What Was Built

Two new files alongside the existing crawl:

- **`effect-crawl.ts`** — Pure Effect program: schemas, error types, service definition, crawl workflow
- **`effect-crawl-action.ts`** — Convex action wrapper that runs the Effect program and stores results

The prototype replicates the full crawl flow:
1. Fetch providers, models, per-model endpoints/uptimes/topApps, analytics
2. Validate responses with Effect Schema (equivalent to the Zod schemas)
3. Collect results into the same `CrawlArchiveBundle` shape
4. Compress and store via the existing `outputs.insert` mutation

## Packages Added

```
effect@3.19.16          — Core runtime, Schema, Context, Layer, etc.
@effect/platform@0.94.4 — HttpClient with FetchHttpClient (uses standard fetch)
```

**No other packages needed.** Schema is built into `effect` since v3.10 (the standalone `@effect/schema` is deprecated).

## Compatibility with Convex Actions

| Requirement | Status | Notes |
|---|---|---|
| TypeScript `strict: true` | ✅ | Already set in `convex/tsconfig.json` |
| `target: ESNext` | ✅ | Needed for generator syntax (`Effect.gen(function* () { ... })`) |
| `moduleResolution: Bundler` | ✅ | Already set |
| `fetch` API available | ✅ | Convex actions have full `fetch` access |
| `Effect.runPromise()` | ✅ | Returns standard `Promise`, works in async action handlers |
| Bundle size | ✅ | ~15-25 KB gzipped; well within Convex limits |
| Tree-shaking | ✅ | Convex uses esbuild, which handles Effect's exports |

**No issues found.** Effect runs in any environment with standard JS + `fetch`. Convex actions qualify.

## Key Patterns Demonstrated

### 1. Tagged Error Types

```typescript
class CrawlHttpError {
  readonly _tag = 'CrawlHttpError' as const
  constructor(readonly url: string, readonly cause: unknown) {}
}

class CrawlParseError {
  readonly _tag = 'CrawlParseError' as const
  constructor(readonly url: string, readonly cause: unknown) {}
}
```

Errors are tracked in the type system. `Effect.either` converts them to `Either<A, E>` for graceful handling without try/catch.

### 2. Service Pattern (Dependency Injection)

```typescript
class OpenRouterApi extends Context.Tag('OpenRouterApi')<OpenRouterApi, {
  readonly fetchModels: () => Effect.Effect<readonly ModelMinimal[], CrawlHttpError | CrawlParseError>
  // ...
}>() {}
```

The API client is defined as a service interface, with a `Layer` providing the live implementation. This enables:
- Testing with mock layers
- Swapping HTTP clients (e.g., for rate-limited vs unrestricted)
- Clear separation between "what" and "how"

### 3. Schema Validation Integrated with HTTP

```typescript
const response = yield* client.execute(request)
return yield* HttpClientResponse.schemaBodyJson(MySchema)(response)
```

Schema validation happens inline with the HTTP response. Parse errors are automatically typed and propagated.

### 4. Retry with Exponential Backoff (Declarative)

```typescript
HttpClient.retryTransient({
  schedule: Schedule.exponential('1 second').pipe(Schedule.compose(Schedule.recurs(2))),
})
```

Retries are configured as middleware on the HTTP client, not scattered through business logic.

### 5. Recovered Errors Collection

Instead of scattered try/catch with console.error, the prototype collects all recovered errors into a typed array:

```typescript
recoveredErrors: Array<{ tag: string; url: string; message: string }>
```

This makes error visibility a first-class output of the crawl, not just log noise.

### 6. Bridge to Promise-Land

```typescript
export const runEffectCrawl = (args) =>
  Effect.runPromise(crawlProgram(args).pipe(Effect.provide(CrawlLive)))
```

One line exits Effect-land. The Convex action just `await`s a normal Promise.

## What Effect Adds Over the Current Approach

| Concern | Current (imperative) | Effect |
|---|---|---|
| Error handling | try/catch + console.error | Typed errors in return channel; `Effect.either` for recovery |
| HTTP client | `up-fetch` wrapper | `HttpClient` service with middleware (retry, base URL, status filtering) |
| Schema validation | Zod schemas | Effect Schema (same capability, integrated with HTTP response) |
| Retry logic | Configured in up-fetch | Declarative `Schedule` combinators; composable |
| Error visibility | Scattered console.error calls | Collected `recoveredErrors` array in output |
| Testability | Would need to mock `fetch` | Swap the `OpenRouterApi` layer for a test implementation |
| Composition | Sequential async/await | Generator-based; can be composed, retried, timed out as units |

## What Effect Does NOT Solve Better

- **Simplicity of the current code** — The existing crawl is straightforward imperative code. It's easy to read and debug. Effect adds abstraction layers that require learning.
- **Convex integration** — The `ctx.runMutation()`, `ctx.storage.store()`, and `ctx.scheduler.runAfter()` calls remain in imperative Convex-land regardless. Effect only wraps the HTTP/validation portion.
- **Bundle size** — Adds ~15-25 KB gzipped. Not a problem, but not free.

## Friction Points Encountered

### Readonly Arrays

Effect Schema produces `readonly` array types. When assigning to mutable array properties, you need to spread: `[...readonlyResult]`. Minor but shows up repeatedly.

### Schema Verbosity for "Loose" Objects

The existing Zod code uses `z.looseObject()` to accept any fields and only validate specific ones. Effect Schema doesn't have a direct equivalent — the closest is `Schema.extend(SpecificFields, Schema.Struct({}, { key: Schema.String, value: Schema.Unknown }))` which is more verbose.

For the crawl use case where we intentionally preserve raw data, `Schema.Record({ key: Schema.String, value: Schema.Unknown })` works well, but for the model/endpoint schemas with specific fields plus extras, the pattern is less elegant than Zod.

### Two-Layer Architecture

Effect shines when the entire program is Effect-native. In the crawl prototype, Effect handles HTTP + validation, but the "store result" step drops back to imperative Convex. This split means you don't get the full benefit of Effect's resource management and error propagation across the whole workflow.

## Recommendations

### Good Fit: Expand Within Crawl

The crawl is the right place if you want to adopt Effect incrementally:
- It's self-contained (no shared state with other features)
- It's I/O-heavy (HTTP calls benefit from Effect's retry/timeout/error patterns)
- It runs as an action (not constrained by Convex's query/mutation model)
- The error collection pattern (`recoveredErrors`) is genuinely useful for observability

### Consider: Effect for the Full Data Pipeline

If Effect proves useful in the crawl, the natural extension is the materialize step — validation and transformation of raw data. Effect Schema could replace Zod validators there too, with integrated error accumulation rather than "throw on first failure."

### Avoid: Sprinkling Effect Everywhere

Effect is most valuable as an "all-in" choice for a bounded subsystem. Using it for one function while the rest stays imperative creates cognitive overhead without proportional benefit. The crawl + materialize pipeline is a natural boundary.

## Running the Prototype

The action is registered at `internal.snapshots.crawl.effectCrawlAction.run` and accepts the same args as the existing crawl. It can be invoked from the Convex dashboard or via `ctx.scheduler.runAfter()`.

```typescript
// From another action or the dashboard:
await ctx.scheduler.runAfter(0, internal.snapshots.crawl.effectCrawlAction.run, {
  uptimes: false,
  topApps: false,
  analytics: false,
  onComplete: { materialize: false },
})
```

## Links

- [Effect Website](https://effect.website/)
- [Effect GitHub](https://github.com/Effect-TS/effect)
- [Effect Schema docs](https://effect.website/docs/schema/introduction/)
- [HttpClient docs](https://effect.website/docs/platform/introduction/)
- [`effect` npm](https://www.npmjs.com/package/effect) — v3.19.16
- [`@effect/platform` npm](https://www.npmjs.com/package/@effect/platform) — v0.94.4
