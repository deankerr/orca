// * Queue payload: one scope to sample. Optional observedAt clusters a full-sample batch.
import * as Schema from 'effect/Schema'

export const WorkMessage = Schema.Struct({
  /** Shared storage time for a full-sample batch. */
  observedAt: Schema.optionalKey(Schema.NonEmptyString),
  permaslug: Schema.NonEmptyString,
  variant: Schema.NonEmptyString,
})
export type WorkMessage = Schema.Schema.Type<typeof WorkMessage>

export const decodeWorkMessage = Schema.decodeUnknownEffect(WorkMessage)
