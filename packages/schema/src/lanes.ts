// oxlint-disable sort-keys -- declaration order is the column order of the stored row, and the
// groupings below are the design; alphabetising would scatter them.

// * The store's vocabulary: what a stored column may hold, the envelopes ingest owns, and how a
// * lane describes itself to ingest. This file is the "lanes, not columns" sketch in
// * notes/data-architecture/normalized-store.md made executable — read that first.
// *
// * A lane is one narrow table holding the columns of an entity that move at the same rhythm.
// * An entity is spread across two to four of them, all keyed by the same natural key, so a
// * field that starts flapping cannot re-version the stable fields beside it. There are three
// * shapes, and every table in the store is one of them:
// *
// * - `versions`   SCD2 over an entity's natural key. Durable facts: identity, capability,
// *                limits, policy. One open row per key at a time.
// * - `dictionary` SCD2 over (natural key, member). For open key sets that grow without notice
// *                — pricing SKUs, feature flags. One real change touches one row.
// * - `series`     append-only transitions, `(entity, field, observed_at, value)`. Where a field
// *                goes when it moves too fast to version. Deliberately field-agnostic: routing
// *                a newly-flapping field here is a config change, not a migration, which is the
// *                only way to keep up with a source whose churn character drifts unannounced.
// * - `log`        append-only records that aren't an entity's columns at all — observations and
// *                pass bookkeeping. Listed here so every table in the store has a declared kind.
// *
// * Nothing is ever discarded at ingest, only routed. A field in the series lane is stored at
// * full fidelity — transitions plus observation coverage reconstruct its value at any instant —
// * so a later reclassification loses nothing.
import * as Schema from 'effect/Schema'

// * SQLite has no boolean; a nullable flag stays three-valued because upstream distinguishes
// * "false" from "not applicable".
export const Bit = Schema.Literals([0, 1])
export const NullableBit = Schema.NullOr(Bit)

// * a text column holding JSON. Only ever for a value whose *whole* shape is one fact —
// * an ordered list, an opaque upstream config. ⚠️ Never for an open key set you will need to
// * diff: that is what a dictionary lane is for, and a blob turns one price change into an
// * unreadable text delta.
export const Json = Schema.String
export const NullableJson = Schema.NullOr(Schema.String)

// * SCD2 envelope — ingest owns these on every `versions` and `dictionary` lane. `valid_from` is
// * the captured_at of the pass that first saw the value, `valid_to` the captured_at where it
// * changed or was confirmed absent (exclusive, null = current). `hash` is the comparison key
// * ingest reads instead of every column.
// * ⚠️ There is no `last_observed_at` here on purpose: staleness is derived by joining
// * observations, so a pass in which nothing changed writes no version rows at all.
export const Validity = Schema.Struct({
  valid_from: Schema.String,
  valid_to: Schema.NullOr(Schema.String),
  hash: Schema.String,
})

// * append-only envelope — the series lanes. No validity, so nothing can be closed out wrongly.
export const Sampled = Schema.Struct({
  observed_at: Schema.String,
})

// * How a lane's rows may be closed out. This is the `failedModelKeys` bug stated as data:
// * a row may only be closed when its scope was successfully observed and the entity was absent.
// * ⚠️ An error is never evidence of absence — it leaves the row open and stale.
type CloseOut =
  // * the entity carries the columns naming its own request scope, so close-out is precise
  | { readonly on: 'scope'; readonly columns: readonly string[] }
  // * deduped across the whole pass, so no per-scope evidence exists — the honest rule is the
  // * conservative one: close nothing unless every scope in the pass answered
  | { readonly on: 'pass' }
  // * the lane's input is a single complete listing, so absence from it is evidence on its own,
  // * independent of how the per-scope requests went
  | { readonly on: 'listing' }
  // * a dictionary member has no scope of its own; it lives and dies with its parent row
  | { readonly on: 'parent'; readonly lane: string; readonly key: string }
  // * append-only — nothing is ever closed
  | { readonly on: 'never' }

// * What ingest needs to know about a lane, as plain data. Every lane exports one of these
// * beside its row schema, so the storage contract and the shape live together.
export type Lane = {
  readonly table: string
  readonly kind: 'versions' | 'dictionary' | 'series' | 'log'
  // * the natural key. Together with `valid_from` (or `observed_at`) this is the primary key,
  // * which is what makes re-ingesting a pass converge instead of duplicate.
  readonly keys: readonly string[]
  readonly columns: readonly string[]
  readonly closeOut: CloseOut
  // * Columns recorded but deliberately NOT part of the comparison hash: provenance for *how*
  // * upstream expressed a value, where the expression can change while the value does not.
  // * ⚠️ Two consequences, both intended. A notation change alone opens no new version — which is
  // * the point, since it is not a change. And a row therefore shows the notation in force when
  // * its version opened, not necessarily the latest one seen.
  // * ⚠️ Every column NOT listed here must be part of the comparison, or a real change can go
  // * unrecorded. Excluding a column is a claim that it carries no meaning of its own.
  readonly provenance?: readonly string[]
}

// * the stored columns of a row schema, in declaration order — the DDL's column list, and what
// * ingest verifies its projection against so a schema change can't drift from the table
export const columnsOf = (row: { readonly fields: Record<string, unknown> }): readonly string[] =>
  Object.keys(row.fields)

// * ── projection helpers ────────────────────────────────────────────────────────────────────
// * Canonical values are JS; stored values are SQL. These three are the whole conversion.

export const bit = (value: boolean): 0 | 1 => (value ? 1 : 0)

// * absent and null both mean "not set" upstream, so both map to a null column — accepting
// * undefined here is what keeps callers free of `?? null` on every optional flag
export const nullableBit = (value: boolean | null | undefined): 0 | 1 | null =>
  value === null || value === undefined ? null : bit(value)

// * lists are sorted before storage so an upstream reordering isn't recorded as a change. The
// * unsorted original survives in the canonical artifact, which is what makes this revisable.
// * ⚠️ Not for a list that IS an order (`default_order`) — use `json` there.
export const list = (values: readonly string[]): string => JSON.stringify([...values].toSorted())

// * verbatim JSON — for ordered lists and opaque upstream config objects
export const json = (value: unknown): string => JSON.stringify(value ?? null)
