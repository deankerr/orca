# Alchemy Layers in the engine

**Status:** authoritative guidance for service, Layer, binding, and Worker composition work in
`apps/engine`.

Alchemy Layers are more than dependency-injection wiring. A Layer can own the cloud resource, declare
the binding to it, install the resulting permissions/configuration, construct the runtime client, and
expose only an application capability. This is the intended way to keep infrastructure behind a small
service contract; see Alchemy's [Layers](../repos/alchemy/website/src/content/docs/infrastructure-as-effects/layers.mdx),
[Bindings](../repos/alchemy/website/src/content/docs/infrastructure-as-effects/binding.mdx), and
[Phases](../repos/alchemy/website/src/content/docs/infrastructure-as-effects/phases.mdx) guides.

## Default shape

- Define a capability as an Effect v4 `Context.Service`. Its interface describes application behavior,
  not R2/D1/queue SDK calls. Effect's canonical forms are documented in
  [`LLMS.md`](../repos/effect/LLMS.md#writing-effect-services) and the
  [v4 services migration](../repos/effect/migration/services.md).
- Put each real implementation in a Layer. The Layer may declare its stable Alchemy Resource, yield the
  appropriate Binding client, and construct the service implementation. This makes the resource,
  permissions, configuration, and client part of one swappable implementation.
- Keep workflows as named `Effect.fn` functions. Operations such as “capture one scope” or “project one
  observation” orchestrate capabilities; they are not services merely because they return an Effect.
- Give a service a `layerNoDeps` when its implementation dependencies are useful test seams, and a
  primary `layer` that supplies normal transport/storage dependencies privately.

```ts
export class ObservationArchive extends Context.Service<
  ObservationArchive,
  {
    put: (
      observation: Observation,
    ) => Effect.Effect<ObservationRef, ArchiveError, Alchemy.RuntimeContext>
  }
>()('engine/observations/ObservationArchive') {}

export const layerNoDeps = Layer.effect(
  ObservationArchive,
  Effect.gen(function* () {
    const bucketResource = yield* Cloudflare.R2.Bucket('Observations')
    const bucket = yield* Cloudflare.R2.ReadWriteBucket(bucketResource)

    return ObservationArchive.of({
      put: (observation) => archive(bucket, observation),
    })
  }),
)

export const layer = layerNoDeps.pipe(Layer.provide(Cloudflare.R2.ReadWriteBucketBinding))
```

Alchemy's complete Layer example demonstrates this exact resource → binding client → private binding
Layer pattern in [Layers: implementation and consumer](../repos/alchemy/website/src/content/docs/infrastructure-as-effects/layers.mdx#the-implementation).

## Preserve `RuntimeContext`

`Alchemy.RuntimeContext` is intentional runtime color. It means an operation may execute only inside a
deployed event handler, where Alchemy supplies the runtime environment. Keep it in every service method
that performs binding-backed I/O. The compiler should reject attempts to execute such methods during
Worker initialization; this boundary is illustrated in
[Layers: the types hold the boundary](../repos/alchemy/website/src/content/docs/infrastructure-as-effects/layers.mdx#the-types-hold-the-boundary)
and explained in [Phases: init vs runtime](../repos/alchemy/website/src/content/docs/infrastructure-as-effects/phases.mdx#init-vs-runtime).

Do **not** erase this requirement in application code with `RuntimeContext.phantom`, casts, or helper
wrappers. `RuntimeContext.phantom` is literally an empty Layer asserted to provide the service
([source](../repos/alchemy/packages/alchemy/src/RuntimeContext.ts#L137-L142)); it does not create a
runtime context. It is an integration escape hatch for code that has independently established that the
ambient handler supplies the context. If a framework adapter ever forces its use, centralize it at that
adapter boundary, document why it is sound, and keep it out of services and callers.

Effect's leaking-requirements diagnostic will flag this intentional Alchemy color. Annotate the service
with `/** @effect-expect-leaking RuntimeContext */`; do not "fix" the warning by erasing the requirement.
Translate binding failures into capability-specific typed errors where useful, but do not use
`Effect.orDie` merely to flatten them. Error translation and runtime requirements are separate concerns.

## Respect the two lifetimes

Worker initialization runs at plantime to discover bindings and again at runtime cold start to build
clients. Returned handler Effects run once per event. Yield Resources, Binding clients, configuration,
and lightweight reusable clients during initialization; execute network, R2, D1, and queue operations
inside service methods or handler workflows. The phase behavior is detailed in
[Phases: what runs when](../repos/alchemy/website/src/content/docs/infrastructure-as-effects/phases.mdx#what-runs-when).

Do not acquire disposable resources into the instance scope. A workerd isolate has no instance teardown
hook, while each request has a fresh Scope and working finalizers. Follow
[Functions and Servers: instance scope vs request scope](../repos/alchemy/website/src/content/docs/infrastructure-as-effects/functions-and-servers.mdx#instance-scope-vs-request-scope):
build reusable things at instance scope; acquire and use disposable things at request scope.

## Compose once, at the boundary

- Use `Layer.provide` to satisfy an implementation dependency privately. Callers see only the service.
- Use `Layer.provideMerge` only when both the service and its dependency intentionally remain public.
- Use `Layer.mergeAll` for independent application capabilities.
- Assemble the application Layer graph once at the Worker composition root. Do not provide a storage or
  HTTP transport Layer around each operation or rebuild the application graph inside each handler.

Effect's [Layer composition example](../repos/effect/ai-docs/src/01_effect/03_services/20_layer-composition.ts)
shows the precise `provide` versus `provideMerge` distinction. Alchemy's
[Layers: composing Layers](../repos/alchemy/website/src/content/docs/infrastructure-as-effects/layers.mdx#composing-layers)
shows the intended application-level `mergeAll` shape.

## Tests and review checks

A service is useful when it hides a substantial application capability or infrastructure policy. A
meaningful alternative implementation—such as R2 and in-memory archives, or real and controlled HTTP
clients—is strong evidence for the boundary, not a prerequisite. Tests provide `layerTest`/`layerMemory`
without changing workflow code. Prefer plain functions for deterministic transforms.

Reject these patterns during review:

- binding/resource construction scattered through workflow call sites;
- `RuntimeContext` removed from an I/O method's type;
- `RuntimeContext.phantom` or a cast used to silence an unsatisfied runtime requirement;
- `Effect.orDie` used merely to discard a binding failure;
- `FetchHttpClient.layer` or another transport Layer provided per operation;
- real I/O executed while constructing a Layer rather than by a returned method;
- disposable resources retained in Worker instance scope;
- a service for every workflow, or infrastructure SDK types leaking through service contracts.
