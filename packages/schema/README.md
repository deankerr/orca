# @orca/schema

Runtime schemas and the transformations between them, in [effect Schema](https://effect.website).
The source of truth for every data shape in the new pipeline: types are derived from schemas
(`Schema.Schema.Type<typeof X>`), never hand-written beside them.

It is a package rather than a folder in a worker because the same shapes are read from both ends:
`apps/pool` validates appends against the envelope, and every producer and consumer has to build or
read one. A shape that lives inside one app is a shape the next consumer copies.

## Variations

The same entity has a different shape at every layer, and each shape exists for a different
reason. Confusing them is how a strict parse ends up rejecting our own output.

| variation     | who writes it     | why it is shaped that way                                                                        |
| ------------- | ----------------- | ------------------------------------------------------------------------------------------------ |
| **envelope**  | the pool          | six infrastructure fields carrying an opaque payload. Knows nothing about what it transports.    |
| **raw**       | upstream          | strict — an unknown key is a _wanted signal_ and must fail loudly. Paired with per-era adapters. |
| **canonical** | Layer 1 processor | flat, snake_case, SQL-ready. One shared baseline across every schema era.                        |

Each variation lives beside the function that produces it, because the schema is the contract that
function has to satisfy: `reference/endpoints.ts` holds the raw endpoint and the canonical row it
becomes. When upstream adds a field, one file changes.

⚠️ Strictness is not a property of the library, it is a decision per boundary. Raw upstream input is
strict, because an unknown key is the signal we most want and this is the only place it is still
visible. Anything downstream that already passed a strict parse should be permissive about extra
keys — dropping unknowns is what lets an older consumer read a newer artifact.

⚠️ The envelope is a third thing again, and the strictness question doesn't apply to it the same
way: it is strict about the six fields it owns and refuses to look at `payload` at all. That is not
laxity, it is the point — see the header comment in `pool.ts`.

## Layout

```
pool.ts             the artifact pool's envelope — the only schema the pool itself has, and the
                    Pipelines stream field list beside it. Read this first: everything else
                    travels through it.
reference/models.ts     raw upstream model + the canonical model row.
reference/endpoints.ts  raw upstream endpoint + the canonical endpoint row.
reference/providers.ts  raw upstream `provider_info` + the canonical provider row.
```

⚠️ `reference/` is exactly that — **reference**. Those shapes were derived from real passes and
their comments carry the measurements behind every decision, but nothing consumes them yet: the
store, lane and pass schemas they were written against were deleted with the first attempt
(`4de0f0b8`). They are the starting point for the consumers that will read the pool, not live code.

## Conventions

- **`// oxlint-disable sort-keys` at the top of every schema file.** Fields are grouped by what
  they _are_ (identity, provider handle, serving shape, capability, policy) and stored in
  declaration order. Alphabetising scatters the groupings that carry the design.
- **Declaration order is column order**, so reordering is a schema change. In `pool.ts` this is
  literal and unforgiving: the Pipelines stream schema has no update API, so the field order there
  is the live table's column order and changing it replaces the table.
- **Documented drops.** A canonical field a consumer deliberately doesn't keep is still declared,
  with the reason. A drop should be visible where someone would look for the field.
- **Compare on meaning, record the notation.** Upstream ships whatever notation was authored —
  `".30e-6"`, `"0.0000003"` and `3e-7` are one price written three ways, and nearly half of all
  price rows arrive in a non-canonical form. A stored row therefore carries the value in one
  canonical rendering (compared) and the authored text as `*_raw` (listed in the lane's
  `provenance`, never compared), so re-authoring cannot register as a change.
- **Don't interpret to save storage.** Excluding a field because it looks derivable is a bet that
  upstream's formula won't change and that we can reproduce their arithmetic. In a narrow lane the
  storage it saves is negligible; noise suppression belongs in the changeset view at read time,
  where the policy is versioned and revisable.
- **Upstream timestamps get an `or_` prefix** once stored, so they can never be mistaken for ours.
  The pool's `observed_at` is ours, and is the only time axis anything above Layer 0 may read.
- **Every measured claim carries its measurement.** Which fields matter and why is a decision made
  from numbers, and the numbers belong in the comment next to the field so the next revision can
  argue with them rather than guess.

## Not done yet

- **The canonical shapes have no consumer.** They decode a raw upstream copy into a flat row and
  stop there; whatever reads the pool and writes a normalized store will be the first thing to use
  them, and will likely reshape them in the process.
- **Era adapters do not exist.** The 1+ year back-catalogue is the reason they will have to, and
  none of it has been through the pool yet.
- **Nothing checks these against a real pass.** The old `schema-check` lived in the deleted
  `apps/store`. Re-earning that check is worth more than extending the shapes further — a schema
  nothing has parsed real data with is a guess with good comments.
