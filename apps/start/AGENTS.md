# start

ORCA's new web app, under construction. The `orca-start` Vercel project deploys it for tester feedback.

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
- `app/`: the app shell (header, status bar, theme), the panel layout, and `keyboard.ts`, the app's key-ownership
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
  put rows in scope; the sort, plot toggle, and selected endpoint ride along. Read one param with a hook such as
  `useSelectedId` or `useSort`, or the filters with `useScopeFilters`, so a component re-renders only for what it
  reads; there is no whole-Scope hook. Change it with `useScopeActions`, and read the filtered, sorted rows with
  `useScopedRows`. The Table and plot read `useDeferredScopedRows` and `useDeferredFilteredRows` instead: they
  trail the filters through `useDeferredValue` (the router's store always updates synchronously) and report `stale`.

## Panel layout

Results is the primary Panel and is always docked. Endpoint and Filters are secondary, and each is `docked` beside
Results, an `overlay` on its trailing edge, or a modal `sheet`. `panelLayout` in `panel-layout.ts` derives placement
from the page width and whether an endpoint is selected, picking the first candidate layout that fits. Breakpoints are
not chosen: they come from the Panels' widths, so they move when a Panel's width does.

| Page width (CSS px) | Nothing selected        | Endpoint selected                                   |
| ------------------- | ----------------------- | --------------------------------------------------- |
| ≥ 1124              | Filters docked          | Filters and Endpoint docked                         |
| 844–1123            | Filters docked          | Endpoint docked, Filters in a left sheet            |
| 776–843             | Filters docked          | Endpoint overlaid, Filters in a left sheet          |
| 636–775             | Filters in a left sheet | Endpoint overlaid, Filters in a left sheet          |
| < 636               | Filters in a left sheet | Endpoint in a bottom sheet, Filters in a left sheet |

- Endpoint outranks Filters: comparison reads the Table beside the selection, while filters are set and left.
- Selecting an endpoint below 1124px moves Filters into a sheet; the scope bar's filters button opens it.
- Nothing about placement is stored. Only the Filters sheet's open flag is state, and it only applies in sheet layouts.
- Render every Panel through `PanelSlot`; its frame reads `usePlacement` and `panelFrameClass` for border and width.
- The server renders the skeleton in the widest layout; `DOCKED_FILTERS_MEDIA_CLASS` hides its Filters on phones.
- The Results frame is the `@container/results` size container; its parts adapt to that width, not the viewport's.
- Below a 32rem Results panel, the Provider column folds into the Model cell's second line (`meta.folds`).
- The Model column is sticky, so the figures scroll under it when the table is wider than the panel.
- Use `pointer-coarse:` to enlarge touch targets, keeping dense desktop sizes for fine pointers.
- Fields keep 16px text on touch screens so iOS does not zoom when they take focus.

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
