> This branch is incompatible with current production data. Do not merge without a migration plan.

# ORCA (OpenRouter Capability Analysis)

## Development

- When dependencies are missing, run `bun install --frozen-lockfile` from the repository root.
- Dependency installation needs no backend setup.
- Use `orca-worktree-setup` when the task establishes that a fresh worktree needs its own backend or running app.
- The main checkout owns the personal dev deployment.
- Worktrees must use their own deployment for code pushes, including `convex run --push`.
- A code push replaces the deployment's functions and auth configuration.
- Use `bun run fix` for all validation and formatting instead of `tsc`.
- Lint suppression requires an explanation: default to `// oxlint-disable-next-line rule -- Reason.`.

## Product and documentation

ORCA serves technical OpenRouter users who value rapid endpoint comparison, precise terminology,
and dense data. `CONTEXT.md` defines domain language.

- Use `orca-docs` when writing, reviewing, or maintaining documentation.
- The root `README.md` serves prospective users; other documentation serves agents and project/technology experts.
- `docs/orca/config.md` records maintained configuration, defaults, and operational requirements.
- Update `docs/orca/config.md` when maintained env vars, defaults, or hardcoded configuration change.
- For maintained Convex env changes, update both dev and preview project defaults.
- Apply maintained Convex env changes to existing deployments as needed.
- Record nonsecret Convex project defaults in `docs/orca/config.md`.
- `docs/openrouter/` records upstream observations and external-system knowledge.
- `docs/orca/` records our interpretation, product policies, invariants, and operational knowledge.
