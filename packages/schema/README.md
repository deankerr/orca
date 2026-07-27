# @orca/schema

Runtime schemas and the transformations between them, in [effect Schema](https://raw.githubusercontent.com/Effect-TS/effect/refs/heads/main/packages/effect/SCHEMA.md).
The source of truth for every data shape in the new pipeline: types are derived from schemas
(`Schema.Schema.Type<typeof X>`), never hand-written beside them.

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
