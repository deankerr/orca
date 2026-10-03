# ORCA (OpenRouter Capability Analysis)

## Development

- When dependencies are missing, run `bun install --frozen-lockfile` from the repository root. This needs no backend setup.
- Use `orca-worktree-setup` when the task establishes that a fresh worktree needs its own backend or running app.
- Use `bun run fix` for all validation and formatting. Not `tsc`.
- Lint suppression requires an explanation: default to `// oxlint-disable-next-line rule -- Reason.`.

## Product and documentation

ORCA serves technical OpenRouter users who value rapid endpoint comparison, precise terminology,
and dense data. See [README](README.md) for products and setup, and [CONTEXT](CONTEXT.md) for domain language.

- `docs/openrouter/` records upstream observations and external-system knowledge.
- `docs/orca/` records our interpretation, product policies, invariants, and operational knowledge.
- Keep documentation focused on what code cannot explain: reasons, constraints, surprising behavior, and external context.
- Give each fact one home. Link to it instead of repeating module inventories or implementation walkthroughs.
