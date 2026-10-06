# ORCA (OpenRouter Capability Analysis)

## Development

- When dependencies are missing, run `bun install --frozen-lockfile` from the repository root. This needs no backend setup.
- Use `orca-worktree-setup` when the task establishes that a fresh worktree needs its own backend or running app.
- The main checkout owns the personal dev deployment. Worktrees must use their own deployment for code pushes, including `convex run --push`; a push replaces the deployment's functions and auth configuration.
- Use `bun run fix` for all validation and formatting. Not `tsc`.
- Lint suppression requires an explanation: default to `// oxlint-disable-next-line rule -- Reason.`.

## Product and documentation

ORCA serves technical OpenRouter users who value rapid endpoint comparison, precise terminology,
and dense data. See [CONTEXT](CONTEXT.md) for domain language.

- Maintain [configuration](docs/orca/config.md) when changing env vars or hardcoded configuration. For Convex env changes, update dev/preview project defaults and record nonsecret values there; update existing deployments as needed.
- `docs/openrouter/` records upstream observations and external-system knowledge.
- `docs/orca/` records our interpretation, product policies, invariants, and operational knowledge.
- Keep documentation focused on what code cannot explain: reasons, constraints, surprising behavior, and external context.
- Give each fact one home. Link to it instead of repeating module inventories or implementation walkthroughs.
