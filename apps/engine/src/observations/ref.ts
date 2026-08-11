// * Reference to one archived observation (R2 object identity, not the body).
// * Shared by capture enqueue and the Sinks bus — bodies stay in Observations.
import * as Schema from 'effect/Schema'

export const ObservationRef = Schema.Struct({
  observedAt: Schema.NonEmptyString,
  scopeKey: Schema.NonEmptyString,
})
export type ObservationRef = Schema.Schema.Type<typeof ObservationRef>
