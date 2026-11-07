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

Results is the primary Panel and is always docked. Filters are docked beside it where both fit, and in a modal
drawer from the left where they do not; docked Filters can be collapsed, Sidebar-style. The Endpoint panel never
docks: it floats over Results in a Base UI drawer at every width, so selecting an endpoint, or moving the
selection with ↑/↓, never reflows the Table or redraws the plot. `panelLayout` in `panel-layout.ts` derives
placement from the page width and the user's Filters preference. Breakpoints are not chosen: they come from the
Panels' widths (Filters 272, Endpoint 384, Results minimum 480, gap 8), the Table's columns (Model 180, Provider
184, and the three 68px price columns the Table keeps clear beside the Endpoint drawer), and the Results frame's
border, so they move when a Panel's or column's width does.

Two Results widths (R, the frame's width, border included) decide everything. Placement is computed in JS from
the page width less the gutter and any docked Filters (`resultsWidth`); the Table's fold reads R alone, in CSS.

| Results width R | Table                             | Endpoint drawer             |
| --------------- | --------------------------------- | --------------------------- |
| ≥ 953           | Provider has its own column       | Beside the Table, non-modal |
| 769–952         | Provider folded into Model's cell | Beside the Table, non-modal |
| < 769, or flush | Provider folded into Model's cell | From the bottom, modal      |

| Page width (CSS px) | Filters                     | R                         |
| ------------------- | --------------------------- | ------------------------- |
| ≥ 776               | Docked                      | page − 296                |
| ≥ 776               | Collapsed                   | page − 16                 |
| < 776               | Drawer from the left, modal | page; flush, drawer below |

So the drawer floats beside the Table from a 1065px page with Filters docked and a 785px page with them
collapsed, and Provider gets its column from 1249 docked and 969 collapsed. Collapsing Filters can therefore
change both, but each is one breakpoint in R.

- **Drawer** (`ENDPOINT_RESULTS_WIDTH`, 769): the drawer covers the end of Results, trailing border included,
  and leaves the frame's leading border (1), the Model column (180), and a clear band of 204 (Input, Output and
  Cache read): 384 + 1 + 180 + 204. Results that runs flush (below 776) keeps the drawer at the bottom whatever
  its width: the drawer's page inset would cut into the band.
- **Fold** (`UNFOLD_RESULTS_WIDTH`, 953): the drawer's width plus Provider's 184, the narrowest Results that
  keeps the band after Provider as well. Below it Provider folds into the Model cell's second line, and the Model
  header carries a second sort button for it ("Model / Provider"). Since 953 > 769, the drawer floats beside the
  Table at every R from 769 up, folded or not, and the band holds 204 or more throughout.
- **Model width** (`MODEL_COLUMN_WIDTH_CSS`): `clamp(180px, 100cqw − 771px, 256px)` of the Results container,
  so 180 wherever the Table folds, then growing with R at exactly the rate that holds the band at 204 beside
  the drawer, up to 256 (a 99th-percentile model name). It meets 180 at the fold, so the column never jumps.
- **Surplus**: every other column has a fixed width. The Table ends with an empty filler column (`FillerCol`,
  `FillerCell`) that takes the rest, so on a wide page the columns sit together on the left and the trailing space
  is empty, with row backgrounds and rules still spanning the panel. No column absorbs surplus between figures.
- Nothing about the Table's columns depends on the layout or the selection, so opening the drawer moves nothing,
  and the server's HTML, the loading skeleton, and the loaded Table lay out the same columns at every width.

- The Endpoint drawer beside the Table is non-modal and leaves focus in the Table, so ↑/↓, clicks on rows,
  and Esc (with focus returning to the row, `keyboard.ts`) keep working; Base UI's own Esc and focus-out
  dismissals are ignored so the keyboard rules decide. From the bottom it is modal and swipes down to close; Base UI's Esc dismissal closes it, since focus may start
  on the popup, outside the panel's own Esc handler (`drawerClosesEndpoint`). A drawer that turns modal while open
  does not remount (that would reset the Endpoint panel's tab); an effect focuses its popup when `modal` turns true.
- While it floats beside the Table, the Table's wrapper gains trailing padding equal to the drawer's width
  (`tableTrailingInset`), so every column can scroll out from under it without the table changing width.
- Whether docked Filters are collapsed is a preference in the `orca-filters` cookie (`filters-preference.ts`),
  which the server reads so the first frame is right. The scope bar's Filters button collapses, expands, or
  opens the drawer, depending on where Filters are; the column's edge rail toggles it too.
- Only whether the user has the Filters drawer open is state, and `useDrawerSession` ties it to the placement it
  was opened in: Filters that leave their drawer end the session, so a window widened until Filters dock and
  narrowed again does not reopen it.
- Below 776px Results is the only docked Panel and runs flush to the screen's edges: no page padding, border, or
  corners, and the scope bar and status bar pad themselves clear of the notch and home indicator.
- The server renders the skeleton for a desktop; the `*_MEDIA_CLASS` constants in `panel-layout.ts` fix a phone's
  layout before scripts run, and a test keeps them at the breakpoint.
- The Table's fold and Model width are CSS on the Results container (`FOLDED_CLASS` and its siblings in
  `columns.tsx`, `MODEL_COLUMN_WIDTH_CSS`), so the server and the skeleton need no width or cookie. Tailwind reads
  the fold's literal `@max-[951px]/results:` (951 is 953 less the two borders, the container's content box), and a
  test keeps it at `UNFOLD_CONTAINER_WIDTH`.
- A Panel's frame reads `usePlacement` and `panelFrameClass` for border and width.
- Results' parts share one side inset, `--results-inset` (16px, 12px in a narrow panel).
- The Results frame is the `@container/results` size container; its parts adapt to that width, not the viewport's.
- The Model column is sticky, so the figures scroll under it when the table is wider than the panel (below 576px
  of Results, the folded Table's columns, where the column's edge shows as a rule).
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
