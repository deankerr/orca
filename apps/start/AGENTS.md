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
Panels' widths (Filters 272, Endpoint 384, Results minimum 480, gap 8), the Table's width rule (below), and the
Results frame's border, so they move when a Panel's or column's width does.

The Table fills Results at every width, by one rule (`tableColumnWidths`, expressed in CSS by the `<col>`s):

- **Model** takes what the figures' minimum leaves, `clamp(180px, 100cqw − 408px, 256px)` of the Results
  container (`MODEL_COLUMN_WIDTH_CSS`). 256 fits a 99th-percentile model name with its avatar and padding.
- **Provider**, where it has a column, is 208: a 99th-percentile provider name with its tags.
- **The six figures** have no width, so the fixed table shares the rest evenly between them, each at least 68.
  The figures stay evenly spaced and right-aligned under their headers, and nothing trails the last column.
- Below 588 (Model 180 and six figures at 68, `TABLE_MIN_WIDTH`) the Table scrolls sideways under the sticky
  Model column.

Two Results widths (R, the frame's width, border included) decide everything. The drawer's is the narrowest R at
which the folded Table keeps its leading columns (Model, Input and Output) clear of the floating drawer
(`foldedTableKeepsLeadingColumnsClear`); the columns under the drawer scroll out from under it. The fold's is the
narrowest R at which the unfolded Table fits with Model at its cap. Placement is computed in JS from the page width
less the gutter and any docked Filters (`resultsWidth`); the Table's fold reads R alone, in CSS.

| Results width R | Table                             | Endpoint drawer                                      |
| --------------- | --------------------------------- | ---------------------------------------------------- |
| ≥ 874           | Provider has its own column       | Beside the Table, non-modal; covers Input and Output |
| 833–873         | Provider folded into Model's cell | Beside the Table, non-modal                          |
| < 833, or flush | Provider folded into Model's cell | From the bottom, modal                               |

| Page width (CSS px) | Filters                     | R                         |
| ------------------- | --------------------------- | ------------------------- |
| ≥ 776               | Docked                      | page − 296                |
| ≥ 776               | Collapsed                   | page − 16                 |
| < 776               | Drawer from the left, modal | page; flush, drawer below |

So the drawer floats beside the Table from a 1129px page with Filters docked and an 849px page with them
collapsed, and Provider gets its column from 1170 docked and 890 collapsed. Collapsing Filters can therefore
change both, but each is one breakpoint in R.

- **Drawer** (`ENDPOINT_RESULTS_WIDTH`, 833): beside the drawer (which covers the end of Results, trailing
  border included) and the frame's leading border sit Model (256) and Input and Output (96 each, a sixth of what
  Model leaves). Results that runs flush (below 776) keeps the drawer at the bottom whatever its width.
- **Fold** (`UNFOLD_RESULTS_WIDTH`, 874): Model at its cap 256, Provider 208, and the six figures at their
  68 minimum, inside the two borders (256 + 208 + 6 × 68 + 2). Below it Provider folds into the Model cell's second
  line, and the Model header carries a second sort button for it ("Model / Provider"). It sits well below where the
  drawer would still leave Input and Output clear (1041), on purpose: folded, a Table sorted by model repeats one
  name down every row and loses the variety Provider gives it. Between 874 and 1040 an open drawer therefore covers
  Input and Output (Model and Provider stay clear); they remain reachable by scrolling (`tableTrailingInset`).
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
  the fold's literal `@max-[872px]/results:` (872 is 874 less the two borders, the container's content box), and a
  test keeps it at `UNFOLD_CONTAINER_WIDTH`; likewise the `588px` minimum at `TABLE_MIN_WIDTH`.
- A Panel's frame reads `usePlacement` and `panelFrameClass` for border and width.
- The Table's edge cells and the status bar share one side inset, `--results-inset` (16px, 12px in a narrow panel).
  The scope bar and the plot sit closer to the frame, on `--results-header-inset` (8px, all around the scope bar), so
  the Filters button is as far from the left edge as from the top; the scope bar's height is the button's plus that
  inset twice, whether or not filters are active, and on a phone its top inset starts below the notch.
- The Results frame is the `@container/results` size container; its parts adapt to that width, not the viewport's.
- The Model column is sticky, so the figures scroll under it when the table is wider than the panel (below 588px
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
