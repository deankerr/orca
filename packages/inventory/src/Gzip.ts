import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'

export class GzipError extends Data.TaggedError('GzipError')<{
  readonly cause: unknown
}> {}

export const gzip = (text: string): Effect.Effect<Uint8Array, GzipError> =>
  Effect.tryPromise({
    catch: (cause) => new GzipError({ cause }),
    // Web Streams CompressionStream is available in Workers and Bun, but has no Effect-native
    // bridge. Keep the Promise adaptation private to this codec.
    // oxlint-disable-next-line effecttsgo/async-function
    try: async () => {
      const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
      return new Uint8Array(await new Response(stream).arrayBuffer())
    },
  })
