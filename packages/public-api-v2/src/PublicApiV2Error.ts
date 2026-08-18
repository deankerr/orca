import * as Predicate from 'effect/Predicate'
import * as Schema from 'effect/Schema'

// oxlint-disable-next-line unicorn/throw-new-error -- Schema.TaggedError factory, not `throw Error()`
export class PublicApiV2Error extends Schema.TaggedError<PublicApiV2Error>()('PublicApiV2Error', {
  cause: Schema.Defect(),
}) {
  // Cause.pretty / String(error) should show the underlying miss, not an empty tag.
  override get message() {
    return Predicate.isError(this.cause) ? this.cause.message : String(this.cause)
  }
}
