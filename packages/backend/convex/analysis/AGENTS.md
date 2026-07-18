# analysis

Functions for exploring our data set. They are not consumed by anything else in the project - run via the dashboard or CLI.

- Use `internalMutation` or `internalAction` for one-off queries here, as the Convex dashboard renders queries reactively - we don't want these heavy queries firing repeatedly.
- Prefer clarity over micro-optimization, but keep reads bounded and stay within Convex function limits.
