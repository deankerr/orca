// * Sinks queue payload: R2 ref to a successful observation (not the body).
// * Bodies live under endpoints/{observedAt}/{scopeKey}.json.gz — keeps messages under 128 KB.
import * as Schema from 'effect/Schema'

export const SinkMessage = Schema.Struct({
  observedAt: Schema.NonEmptyString,
  scopeKey: Schema.NonEmptyString,
})
export type SinkMessage = Schema.Schema.Type<typeof SinkMessage>

export const decodeSinkMessage = Schema.decodeUnknownEffect(SinkMessage)
