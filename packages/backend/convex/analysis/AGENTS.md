# analysis

Functions for exploring our data set. They are not consumed by anything else in the project - run via the dashboard or CLI.

- Use `internalMutation`/`internalAction` instead of `internalQuery` for non-reactivity
- Efficiency is not a priority.

## logos.ts

Reports logo coverage for all models and providers in the catalog. Uses `resolveLogo` from `@orca/entity-logos` to check which slugs resolve to a logo and which are missing. Returns counts and a sorted list of missing entity refs (slug + name).
