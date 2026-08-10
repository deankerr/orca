// * Binding callables need RuntimeContext. Phantom erases it at the type level; the Worker provides
// * the real ambient context at runtime. Failures are defects — callers cannot recover from R2/queue
// * outages on the capture path.
import { RuntimeContext } from 'alchemy'
import * as Effect from 'effect/Effect'

export const fromBinding = <A, E>(effect: Effect.Effect<A, E, RuntimeContext>): Effect.Effect<A> =>
  effect.pipe(Effect.orDie, Effect.provide(RuntimeContext.phantom))
