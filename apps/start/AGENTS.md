# start

ORCA's new web app. Under construction, no remote deployment.

- Use the `shadcn` skill when building or modifying components. Add components to `packages/ui` on demand.
- The `cn` package replaces the old shadcn/ui className helper util.
- Use `remeda` for concise, type safe, and functional data transformation.
- Identical `convex` queries are always deduped when used throughout the app.
- Use `@tanstack/react-store` for Zustand and/or Jotai like local state management.

## Structure

A folder's place says who owns it. **A feature is a Panel**: each folder under `src/panels/` holds that
Panel's components, logic, and tests, and nothing else reaches into it. Code used by two or more Panels
lives in a shared folder.

- `routes/`: TanStack Router files. Layout and route options only.
- `app/`: the app shell (header, status bar, theme) and `keyboard.ts`, the app's key-ownership
  and focus-return rules.
- `endpoints/`: the data layer, which is not a Panel. It builds the Snapshot from the query, defines the
  Scope (the URL's filter state) and sort, filters and counts rows, and exposes them through `hooks.ts`.
- `panels/`: `filters/`, `results/` (with `table/` and `plot/`), and `endpoint/`. A Panel's labels and
  formatters stay in it unless a second Panel needs them.
- `components/`: React components shared across Panels.
- `lib/`: no React and no ORCA domain beyond display basics: the search serializer, OpenRouter URLs, and
  shared formatters in `format.ts`.

Import across folders by alias (`#app/*`, `#endpoints/*`, `#panels/*`, `#components/*`, `#lib/*`) and within
a folder by `./`; never `../`. The aliases are extensionless and also listed in `tsconfig.json#paths`.

Vocabulary:

- **Snapshot**: the query's payload (`SnapshotPayload`) joined into `EndpointRow`s, built by `buildSnapshot`
  and read with `useSnapshot`.
- **Scope**: the index route's URL state, defined in `endpoints/scope.ts`. Its filters (`ScopeFilters`)
  put rows in scope; the sort, plot toggle, and selected endpoint ride along. Read it with `useScope`,
  change it with `useScopeActions`, and read the filtered, sorted rows with `useScopedRows`.

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
