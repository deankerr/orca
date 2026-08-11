// * Binding callables need RuntimeContext. Phantom erases it at the type level; the Worker provides
// * the real ambient context at runtime. Failures surface as defects.
import { RuntimeContext } from 'alchemy'
import * as Effect from 'effect/Effect'

export const fromBinding = <A, E>(effect: Effect.Effect<A, E, RuntimeContext>): Effect.Effect<A> =>
  effect.pipe(Effect.orDie, Effect.provide(RuntimeContext.phantom))
