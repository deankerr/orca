# OXC

- Use `bun run check` to type check, lint, auto-fix, and format the entire project in <1 sec with `oxlint`, `oxlint-tsgolint`, and `oxfmt`.
- Strict, type-aware linting is enabled, based on the `ultracite` preset.
- If a rule seems invalid or inappropriate, you must justify the reasoning before using an inline ignore comment.
- We generally don't apply our strict rule set to component registry code, like shadcn-ui.
