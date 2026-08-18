import * as Effect from 'effect/Effect'
import * as Predicate from 'effect/Predicate'
import * as Schema from 'effect/Schema'

// oxlint-disable-next-line unicorn/throw-new-error -- Schema.TaggedError factory, not `throw Error()`
export class GzipError extends Schema.TaggedError<GzipError>()('GzipError', {
  cause: Schema.Defect(),
}) {
  override get message() {
    return Predicate.isError(this.cause) ? this.cause.message : String(this.cause)
  }
}

// CompressionStream has no Effect-native bridge. Keep the Promise adaptation here.
export const gzip = (text: string): Effect.Effect<Uint8Array, GzipError> =>
  Effect.tryPromise({
    catch: (cause) => new GzipError({ cause }),
    // oxlint-disable-next-line effecttsgo/async-function
    try: async () => {
      const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
      return new Uint8Array(await new Response(stream).arrayBuffer())
    },
  })
