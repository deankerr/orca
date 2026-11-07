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
Panels' widths (Filters 272, Endpoint 384, Results minimum 480, gap 8, and the Model column and price figures the
Table keeps visible beside the Endpoint drawer), so they move when a Panel's width does.

| Page width (CSS px) | Filters                               | Endpoint drawer                    |
| ------------------- | ------------------------------------- | ---------------------------------- |
| ≥ 1064              | Docked, or collapsed if the user says | Beside the Table, non-modal        |
| 784–1063            | Docked                                | From the bottom, modal             |
| 784–1063            | Collapsed                             | Beside the Table, non-modal        |
| 776–783             | Docked, or collapsed if the user says | From the bottom, modal             |
| < 776               | Drawer from the left, modal           | From the bottom, modal; page flush |

The Endpoint drawer floats beside the Table only where Results, once the drawer covers its end, still shows
the sticky Model column (180) and the three price columns (3 × 68): Results ≥ 384 + 180 + 204 = 768. Docked
Filters take 280 of the page (column and gap) from Results, so the same drawer needs a page 280px wider (1064
against 784) while they are docked. Collapsing Filters can therefore change the drawer's edge.

- The Endpoint drawer beside the Table is non-modal and leaves focus in the Table, so ↑/↓, clicks on rows,
  and Esc (with focus returning to the row, `keyboard.ts`) keep working; Base UI's own Esc and focus-out
  dismissals are ignored so the keyboard rules decide. From the bottom it is modal and swipes down to close; Base UI's Esc dismissal closes it, since focus may start
  on the popup, outside the panel's own Esc handler (`drawerClosesEndpoint`). A drawer that turns modal while open
  is keyed by its modality, so it remounts and takes focus.
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
- A Panel's frame reads `usePlacement` and `panelFrameClass` for border and width.
- Results' parts share one side inset, `--results-inset` (16px, 12px in a narrow panel).
- The Results frame is the `@container/results` size container; its parts adapt to that width, not the viewport's.
- Below a 32rem Results panel, the Provider column folds into the Model cell's second line (`meta.folds`), and the
  Model header carries a second sort button for it ("Model / Provider").
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
