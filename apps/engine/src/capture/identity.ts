// * Extract endpoint ids from an endpoints success body.
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

// * Envelope only; rows validated one at a time so one bad element drops just that row.
const Envelope = Schema.Struct({
  data: Schema.Array(Schema.Unknown),
})
const decodeEnvelope = Schema.decodeUnknownOption(Schema.fromJsonString(Envelope))

const Row = Schema.Struct({ id: Schema.String })
const decodeRow = Schema.decodeUnknownOption(Row)

/** Endpoint ids from a raw OpenRouter endpoints JSON body, or null if unusable. */
export const endpointIds = (body: string): string[] | null => {
  const envelope = decodeEnvelope(body)
  if (Option.isNone(envelope)) {
    return null
  }

  const ids: string[] = []
  for (const row of envelope.value.data) {
    const identity = decodeRow(row)
    if (Option.isSome(identity) && identity.value.id.length > 0) {
      ids.push(identity.value.id)
    }
  }

  return ids.length > 0 ? ids : null
}
