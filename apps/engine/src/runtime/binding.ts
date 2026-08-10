// * Binding callables require `RuntimeContext` (Worker ambient runtime). That requirement cannot be
// * named while building HttpApi / Layer handlers, so Alchemy erases it with `RuntimeContext.phantom`
// * — an empty Layer typed as if it provided the service. Real context is present at runtime.
// *
// * Apply once at the binding edge (archive, queue), not at every caller. Failures are defects:
// * callers of these surfaces cannot recover from R2/queue outages.
import { RuntimeContext } from 'alchemy'
import * as Effect from 'effect/Effect'

export const fromBinding = <A, E>(effect: Effect.Effect<A, E, RuntimeContext>): Effect.Effect<A> =>
  effect.pipe(Effect.orDie, Effect.provide(RuntimeContext.phantom))
