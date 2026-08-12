// * gzip codec via platform CompressionStream / DecompressionStream (Workers + Bun).
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'

class CompressionError extends Data.TaggedError('CompressionError')<{
  readonly operation: 'gzip' | 'gunzip'
  readonly cause: unknown
}> {}

export const gzip = (text: string): Effect.Effect<Uint8Array> =>
  Effect.tryPromise({
    catch: (cause) => new CompressionError({ cause, operation: 'gzip' }),
    // Web Streams CompressionStream has no Effect-native bridge yet.
    // oxlint-disable-next-line effecttsgo/async-function
    try: async () => {
      const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
      return new Uint8Array(await new Response(stream).arrayBuffer())
    },
  }).pipe(Effect.orDie)

export const gunzip = (bytes: ArrayBuffer | Uint8Array): Effect.Effect<string> =>
  Effect.tryPromise({
    catch: (cause) => new CompressionError({ cause, operation: 'gunzip' }),
    // Web Streams DecompressionStream has no Effect-native bridge yet.
    // oxlint-disable-next-line effecttsgo/async-function
    try: async () => {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
      return await new Response(stream).text()
    },
  }).pipe(Effect.orDie)
