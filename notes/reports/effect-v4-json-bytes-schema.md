# Effect v4 beta: JSON `Uint8Array` decoding

This report uses only the vendored Effect source, currently `effect@4.0.0-beta.102`.
([package](../../repos/effect/packages/effect/package.json))

## Recommendation

Use `Schema.fromJsonString(Payload)` for JSON parsing and structural validation. Compose it
directly with `Schema.Uint8Array` through one small, local UTF-8 transformation:

```ts
import { Effect, Option, Schema, SchemaIssue, SchemaTransformation } from 'effect'

const Payload = Schema.Struct({
  id: Schema.String,
  count: Schema.Number,
})

const utf8 = new TextDecoder('utf-8', { fatal: true })
const text = new TextEncoder()

const PayloadFromUtf8Bytes = Schema.Uint8Array.pipe(
  Schema.decodeTo(
    Schema.fromJsonString(Payload),
    SchemaTransformation.transformOrFail({
      decode: (bytes) =>
        Effect.try({
          try: () => utf8.decode(bytes),
          catch: () =>
            new SchemaIssue.InvalidValue(Option.some(bytes), {
              message: 'Expected valid UTF-8 bytes',
            }),
        }),
      encode: (json) => Effect.succeed(text.encode(json)),
    }),
  ),
)

const decodePayload = Schema.decodeUnknownEffect(PayloadFromUtf8Bytes)
```

This is the direct pipeline: `Uint8Array` -> UTF-8 JSON text -> `JSON.parse` -> `Payload`.
`Schema.decodeTo` is the composition API; it connects the source schema to the target schema with
a bidirectional transformation. `Schema.fromJsonString` parses first and then decodes the supplied
schema, so its target is exactly the JSON-text boundary needed here.
([`Schema.decodeTo`](../../repos/effect/packages/effect/src/Schema.ts#L5482-L5557),
[`Schema.fromJsonString`](../../repos/effect/packages/effect/src/Schema.ts#L12368-L12424),
[documented composition example](../../repos/effect/packages/effect/SCHEMA.md#string-encoding-support))

Do **not** manually call `JSON.parse` and then decode `unknown`. `fromJsonString` already calls
`JSON.parse`, turns parse failures into `SchemaIssue.InvalidValue`, and immediately runs the
provided schema. The vendored tests cover both successful struct decoding and a struct-validation
failure through this API.
([parser implementation](../../repos/effect/packages/effect/src/SchemaGetter.ts#L982-L1024),
[tests](../../repos/effect/packages/effect/test/schema/Schema.test.ts#L5617-L5652))

## Native API boundary

The needed native APIs are:

- `Schema.Uint8Array`: validates that the input is a JavaScript `Uint8Array`.
- `Schema.fromJsonString(schema, options?)`: JSON-text codec; supports `reviver`, `replacer`, and
  `space` options.
- `Schema.decodeTo(to, transformation)`: composes the byte schema with the JSON-string codec.
- `SchemaTransformation.transformOrFail`: makes malformed UTF-8 a schema failure.
- `Schema.decodeUnknownEffect` (or `decodeUnknownSync` where throwing is intended): runs the final
  boundary schema.

Effect v4 beta does **not** provide a native `Uint8Array` <-> UTF-8 `String` Schema transformation
in the inspected Schema APIs. Its built-in byte transformations are Base64/Base64URL/hex string
conversions; `Schema.Uint8Array` itself also has a Base64 JSON representation. Therefore one
`TextDecoder`/`TextEncoder` transformation is necessary, but it should live inside the composed
schema rather than be repeated at every decode call site.
([built-in byte schemas](../../repos/effect/packages/effect/src/Schema.ts#L13197-L13354),
[built-in encoding transformations](../../repos/effect/packages/effect/src/SchemaTransformation.ts#L1437-L1577))

## Caveats

- Use `new TextDecoder("utf-8", { fatal: true })` when malformed bytes must fail. The vendored
  event-log implementation uses this strict decoder and converts decode errors into an Effect
  failure; `transformOrFail` gives the schema equivalent of that behavior.
  ([event-log source](../../repos/effect/packages/effect/src/unstable/eventlog/EventLogSessionAuth.ts#L11-L16),
  [its failure mapping](../../repos/effect/packages/effect/src/unstable/eventlog/EventLogSessionAuth.ts#L128-L137))
- The encoder function is required even for a decode-focused schema because `decodeTo` defines a
  bidirectional codec. `TextEncoder` is the appropriate reverse UTF-8 conversion.
  ([transformation contract](../../repos/effect/packages/effect/src/SchemaTransformation.ts#L102-L164),
  [`transformOrFail`](../../repos/effect/packages/effect/src/SchemaTransformation.ts#L275-L343))
- This applies to one complete JSON byte array. Streaming JSON needs framing and incremental text
  decoding; it is not equivalent to applying this schema separately to arbitrary chunks.
- `Schema.Struct` does not preserve undeclared keys by default: the documentation's
  `fromJsonString(Schema.Struct({ a: Schema.Number }))` example decodes `{"a":1,"b":2}` as
  `{ a: 1 }`. Add an explicit policy if rejecting or retaining extra wire fields is required.
  ([documentation example](../../repos/effect/packages/effect/SCHEMA.md#fromjsonstring))
