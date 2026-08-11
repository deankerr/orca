// * CaptureQueue payload: one scope to sample. Optional observedAt clusters a full-sample batch.
import * as Schema from 'effect/Schema'

export const CaptureJob = Schema.Struct({
  /** Shared storage time for a full-sample batch. */
  observedAt: Schema.optionalKey(Schema.NonEmptyString),
  permaslug: Schema.NonEmptyString,
  variant: Schema.NonEmptyString,
})
export type CaptureJob = Schema.Schema.Type<typeof CaptureJob>

export const decodeCaptureJob = Schema.decodeUnknownEffect(CaptureJob)
