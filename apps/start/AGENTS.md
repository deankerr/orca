# start

ORCA's new web app. Under construction, no remote deployment.

- Use the `shadcn` skill when building or modifying components. Add components to `packages/ui` on demand.
- The `cn` package replaces the old shadcn/ui className helper util.
- Use `remeda` for concise, type safe, and functional data transformation.
- Identical `convex` queries are always deduped when used throughout the app.
- Use `@tanstack/react-store` for Zustand and/or Jotai like local state management.

<!-- intent-skills:start -->

## Skill Loading

Use the repository’s installed Intent. If it is unavailable, report the missing dependency instead of downloading a replacement.
Before editing files for a substantial task:

- Run `bunx --no-install --package @tanstack/intent intent list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `bunx --no-install --package @tanstack/intent intent load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.

<!-- intent-skills:end -->
