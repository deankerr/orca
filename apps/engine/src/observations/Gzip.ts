// * gzip codec via platform CompressionStream / DecompressionStream (Workers + Bun).
import * as Effect from 'effect/Effect'

export const gzip = (text: string): Effect.Effect<Uint8Array> =>
  Effect.tryPromise({
    catch: (cause) => new Error(`gzip failed: ${String(cause)}`),
    try: async () => {
      const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
      return new Uint8Array(await new Response(stream).arrayBuffer())
    },
  }).pipe(Effect.orDie)

export const gunzip = (bytes: ArrayBuffer | Uint8Array): Effect.Effect<string> =>
  Effect.tryPromise({
    catch: (cause) => new Error(`gunzip failed: ${String(cause)}`),
    try: async () => {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
      return await new Response(stream).text()
    },
  }).pipe(Effect.orDie)
