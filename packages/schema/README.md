# @orca/schema

Runtime schemas and the transformations between them, in [effect Schema](https://effect.website).
The source of truth for every data shape in the new pipeline: types are derived from schemas
(`Schema.Schema.Type<typeof X>`), never hand-written beside them.

It is a package rather than a folder in a worker because the same shapes are read by the capture
Worker, the local processors in `packages/processes`, the store, and eventually the frontend. A
shape that lives inside one app is a shape the next consumer copies.

## Variations

The same entity has a different shape at every layer, and each shape exists for a different
reason. Confusing them is how a strict parse ends up rejecting our own output.

| variation                | who writes it      | why it is shaped that way                                                                        |
| ------------------------ | ------------------ | ------------------------------------------------------------------------------------------------ |
| **raw** (not yet ported) | upstream           | strict — an unknown key is a _wanted signal_ and must fail loudly. Paired with per-era adapters. |
| **canonical**            | Layer 1 processor  | flat, snake_case, SQL-ready. One shared baseline across every schema era.                        |
| **store rows** (`*Row`)  | the store's ingest | one per lane, SQL types only, columns in stored order.                                           |

Each variation lives beside the function that produces it, because the schema is the contract that
function has to satisfy: `endpoints.ts` holds the canonical endpoint, the four lanes it fans out
into, and the `to*` projections between them. When upstream adds a field, one file changes.

⚠️ Strictness is not a property of the library, it is a decision per boundary. Canonical input to
the store is deliberately **permissive about extra keys** — it already passed a strict parse
upstream, and dropping unknowns is what lets an older consumer read a newer artifact. Raw upstream
input is the opposite and must stay strict.

## Layout

```
lanes.ts         the store's vocabulary: column types, the SCD2 / append-only envelopes,
                 the Lane descriptor, and the three projection helpers. Read this first.
observations.ts  what we looked at and what answered, plus evidence grading. The table every
                 close-out decision reads.
catalog.ts       "does this slug have endpoints right now" — the evidence that separates a
                 withdrawn model from one listed with zero endpoints.
endpoints.ts     canonical endpoint + durable / pricing / features / series lanes.
models.ts        canonical model + durable / parameters / series lanes.
providers.ts     canonical provider + durable / series lanes.
pass.ts          the pass envelope — the whole Layer 1 artifact contract — and every lane.
```

## Conventions

- **`// oxlint-disable sort-keys` at the top of every schema file.** Fields are grouped by what
  they _are_ (identity, provider handle, serving shape, capability, policy) and stored in
  declaration order. Alphabetising scatters the groupings that carry the design.
- **Declaration order is column order.** `columnsOf(Row)` is what ingest verifies against the real
  table, so reordering a projection is a schema change.
- **Documented drops.** A canonical field the store deliberately doesn't keep is still declared,
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
- **Every measured claim carries its measurement.** The lane a field sits in is a decision made
  from numbers (`bun run churn` in `packages/processes`), and the numbers are in the comment next
  to it so the next revision can argue with them rather than guess.

## Checking it against real data

`bun run schema-check` in `apps/store` feeds a real mirrored pass through the current zod
canonicalizer and into these lanes. It fails if a canonical field doesn't decode or a projection
drifts from its lane's declared columns, and reports the bootstrap cost in D1 statements —
⚠️ schema width is what couples these shapes to a platform limit.

## Not done yet

- **The raw upstream shapes and era adapters are still zod**, in `packages/processes/src/canonicalize`.
  They work and they are era-adapted, so they stay until there is a reason to move them; when they
  come across, the canonical shapes here become their output type and `packages/processes` imports
  instead of declaring.
- **No DDL generation.** Migrations are hand-written SQL with their own comments, and ingest
  verifies its projections against the real tables. Generating the DDL from `columnsOf` is the
  obvious next step and deliberately not taken yet — a hand-written table with reasons in it is
  worth more than one less place to make a typo.
