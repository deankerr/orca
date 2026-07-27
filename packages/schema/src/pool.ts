// oxlint-disable sort-keys -- declaration order IS the stream's column order, and the stream schema
// is immutable once created. Alphabetising would silently reorder a live table's columns.

// * The artifact pool's envelope — the only schema the pool has.
// *
// * The pool is a substrate: producers append, consumers read past their own cursor. It knows
// * nothing about what it carries. `kind`, `subject`, `attrs` and `payload` are opaque to it — it
// * validates that they are *well formed*, never that they *mean* anything. All the OpenRouter
// * specifics (HTTP status, response headers, the response body) live inside `payload`, which the
// * pool never opens. See notes/data-architecture/artifact-pool.md §4.
// *
// * ⚠️ Cloudflare Pipelines has no update API for a stream's schema: changing the field list below
// * replaces the stream, and therefore the table. `attrs` exists so that never has to happen — a
// * producer needing another field puts it there.
import type * as DateTime from 'effect/DateTime'
import * as Schema from 'effect/Schema'

// * ── the envelope ───────────────────────────────────────────────────────────────────────────
// * What a producer hands to `POST /append`. Decoded at the boundary and never re-examined.
export const Append = Schema.Struct({
  // * which family of artifact this is. Opaque: the pool only ever compares it for equality, so a
  // * consumer can subscribe to one family without the pool knowing what the family means.
  kind: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(128)),

  // * the producer's own identity for the thing observed — one scope, one endpoint, one document.
  // * Opaque: never parsed, never split, never joined on by the pool. A producer that wants
  // * structure in here (`slug|variant`) owns that convention entirely.
  // * ⚠️ Named `subject`, not `key`: `KEY` is a reserved word in standard SQL, and this column name
  // * is read by two SQL engines we don't control (the Pipelines transform, then R2 SQL). On an
  // * immutable schema that is not a risk worth carrying for one word.
  subject: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(1024)),

  // * ⚠️ THE time axis (§2). The moment *we* made the request — not when upstream generated the
  // * data, which is unknowable behind a cache, and not when the pool happened to receive it.
  // * Decoded to a `DateTime.Utc` so a producer's offset notation can't leak into storage: one
  // * axis, one rendering. Distinct from `__ingest_ts` below, which is pool plumbing.
  observed_at: Schema.DateTimeUtcFromString,

  // * who appended this, versioned by convention (`capture@1`). Consumers use it to tell a
  // * re-derivation apart from an original observation; the pool only records it.
  producer: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(64)),

  // * the escape hatch that keeps the immutable schema above from being a trap. A bag of
  // * producer-controlled keys — the pool stores it and never reads it.
  attrs: Schema.optional(Schema.Record(Schema.String, Schema.Json)),

  // * ⚠️ entirely opaque, and required. For an HTTP observation this is `{ status, headers, body }`
  // * — all three are the producer's business. Storing headers *inside* the opaque payload is what
  // * makes §2's rule ("no layer above may read them") structural rather than a rule to remember.
  payload: Schema.Json,
})
export type Append = Schema.Schema.Type<typeof Append>

// * ── the stream's schema ────────────────────────────────────────────────────────────────────
// * The same six fields as Cloudflare Pipelines declares them. Kept in this file, beside the
// * schema above, precisely because the stream's copy is immutable: if the two ever disagree the
// * pool validates one shape and stores another, and the only fix is replacing the table. One
// * file, one diff, no converter — six fields do not earn an abstraction.
export const STREAM_FIELDS = [
  { type: 'string', name: 'kind', required: true },
  { type: 'string', name: 'subject', required: true },
  { type: 'timestamp', name: 'observed_at', required: true, unit: 'millisecond' },
  { type: 'string', name: 'producer', required: true },
  { type: 'json', name: 'attrs', required: false },
  { type: 'json', name: 'payload', required: true },
] as const

// * ── what a consumer reads back ─────────────────────────────────────────────────────────────
// * ⚠️ There is deliberately no `Row` schema here, and the pool never decodes one. It validates on
// * append and *forwards* on read: a row it parsed would be a row it could reject, and a malformed
// * payload must not be able to fail a read of the layer whose whole job is to interpret nothing
// * (§4). Interpreting a payload is the consumer's business, under the consumer's own schema.
// *
// * The one thing a reader does need help with: `attrs` and `payload` are `json` columns, and R2
// * SQL may hand them back as nested values or as JSON-encoded strings — the docs don't say which.
// * `jsonColumn` tolerates both. The ambiguity is only theoretical: a payload that is itself a bare
// * JSON string arrives quoted in the encoded form and unquoted in the nested form.
// * `apps/pool/scripts/harness.ts` prints the form actually observed.
export const jsonColumn = (value: unknown): Schema.Json => {
  if (typeof value !== 'string') {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the column is JSON-typed by construction; nothing here inspects it further
    return value as Schema.Json
  }
  try {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- JSON.parse of a json column yields a JSON value
    return JSON.parse(value) as Schema.Json
  } catch {
    // * a plain string column value is itself valid JSON
    return value
  }
}

// * ── the columns a consumer may ask for ─────────────────────────────────────────────────────
// * Reads are projected, because `payload` dominates a row: a consumer deciding *whether* it cares
// * about a subject shouldn't pay to transport the body. Enumerated (rather than passed through to
// * SQL) so a caller can never inject a column list.
export const ENVELOPE_COLUMNS = [
  '__ingest_ts',
  'kind',
  'subject',
  'observed_at',
  'producer',
] as const
export const ALL_COLUMNS = [...ENVELOPE_COLUMNS, 'attrs', 'payload'] as const

export type Cursor = {
  /** Consumer name — its own identity, and the primary key of its cursor. */
  consumer: string
  /** Exclusive lower bound: the `__ingest_ts` this consumer has already processed up to. */
  cursor: DateTime.Utc
  /** How far behind the pool head this consumer may fall before it is considered stalled. */
  lag_budget_seconds: number
}
