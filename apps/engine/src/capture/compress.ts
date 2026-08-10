// * gzip via the platform CompressionStream (Workers + Bun).
import * as Effect from 'effect/Effect'

export const gzip = (text: string): Effect.Effect<Uint8Array> =>
  Effect.tryPromise({
    catch: (cause) => new Error(`gzip failed: ${String(cause)}`),
    try: async () => {
      const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
      return new Uint8Array(await new Response(stream).arrayBuffer())
    },
  }).pipe(Effect.orDie)
