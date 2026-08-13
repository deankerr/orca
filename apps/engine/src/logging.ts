// * Runtime log format for Cloudflare Workers Logs.
// *
// * Alchemy runs handlers on a fresh fiber with the platform logger (pretty /
// * default). Logger.layer on the Worker init Effect only covers init — not
// * cron, queue, or fetch. Pipe `withAppLogger` onto every event handler.
import * as Effect from 'effect/Effect'
import * as Logger from 'effect/Logger'

/** One JSON line per log so message + annotations stay a single Workers Logs event. */
export const AppLoggerLive = Logger.layer([Logger.consoleJson])

export const withAppLogger = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(AppLoggerLive))
