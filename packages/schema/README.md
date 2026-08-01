# @orca/schema

Runtime schemas and the transformations between them, in [effect Schema](https://raw.githubusercontent.com/Effect-TS/effect/refs/heads/main/packages/effect/SCHEMA.md).
The source of truth for every data shape in the new pipeline: types are derived from schemas
(`Schema.Schema.Type<typeof X>`), never hand-written beside them.

`artifacts.ts` is the vocabulary of the archive — the ids a key is spelled from, what each stored
object records about itself, and what the engine's API says about both. `openrouter.ts` is upstream's
shapes as upstream sends them. The two are deliberately not the same schemas: see _Parse at the edge_
below.

## Conventions

- **`// oxlint-disable sort-keys` at the top of every schema file.** Fields are grouped by what
  they _are_ (identity, provider handle, serving shape, capability, policy) and stored in
  declaration order. Alphabetising scatters the groupings that carry the design.
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
- **Every measured claim carries its measurement.** Which fields matter and why is a decision made
  from numbers, and the numbers belong in the comment next to the field so the next revision can
  argue with them rather than guess.

## Effect Schema practice

- **Parse at the edge, and only once.** A schema describing an upstream payload uses
  `Schema.String` — that is what upstream sends, and a constraint there describes what we wish they
  sent. Constraints and brands live on _our_ ids (`BatchId`, `Permaslug`, `ArtifactName`), and the
  crawl turns the former into the latter at the one point where a string becomes something we address
  by. Downstream of that, a function taking `BatchId` re-checks nothing.
- **Brand what could be confused, and what is dangerous unchecked.**
  `Schema.String.check(Schema.isPattern(…)).pipe(Schema.brand('BatchId'))` gives a type that cannot be
  spelled by hand and a value that cannot exist unparsed. Both matter when the string ends up in a
  storage key that an HTTP caller supplied.
- **One codec for both directions.** Stored object metadata is written by `encodeSync` and read by
  `decodeUnknownSync` through the same struct, so `status: 404` ⇄ `"404"` and a timestamp ⇄ an ISO
  string are one decision. Two schemas facing each other is where drift starts.
- **Sync for our own data, effectful for theirs.** A failure decoding something we wrote is a bug, and
  a thrown `SchemaError` inside an `Effect.fn` body is already a defect — no `orDie` ceremony. Reserve
  `decodeUnknownEffect` for input that is genuinely allowed to be wrong.
- **Filters are called, not referenced**: `Schema.check(Schema.isInt(), Schema.isBetween({ minimum:
1, maximum: 1000 }))`. The v4 filters are constructors.
- **Annotate for the reader you cannot see.** `identifier` and `description` on a schema, and
  `annotateKey` on a field, are what the generated OpenAPI document says about it. A schema that
  serves an API is documentation whether or not anyone wrote any.
- **A literal union is a bet on upstream.** `variant` is a checked string, not
  `Schema.Literals(['standard', 'free', …])`: a variant OpenRouter invents tomorrow must still be
  crawlable. Use `Literals` where a closed set is ours to close.
