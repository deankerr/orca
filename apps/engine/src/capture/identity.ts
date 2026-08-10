// * Minimal identity extraction from an endpoints success body.
// * Only needs string `id` on rows in `data` — no product field parsing, no stats stripping.
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

// * Envelope only — rows are validated one at a time so a single bad element does not drop the scope.
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
