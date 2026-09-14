# Web shared-code audit

Updated: 2026-09-14. Scope: remaining ownership, correctness, and normalization work in `apps/web` following the endpoints grid and pricing-history v3 migrations.

## Task map

Tasks are grouped by owner. Dependencies identify work that benefits from being done together or after another task; independent tasks can be picked up directly. Paths below are relative to `apps/web` unless stated otherwise.

| ID       | Task                                            | Dependency / decision                                                                |
| -------- | ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| API-1    | Colocate API-page-only code in `app/api`        | Independent; use this route directory, not a new feature directory.                  |
| GRID-1   | Collect grid-owned implementation               | Choose the grid's home before moving files.                                          |
| GRID-2   | Centralize grid URL policy                      | Coordinate with GRID-1 to avoid moving the same helpers twice.                       |
| GRID-3   | Normalize conflicting facet filters and counts  | Share the normalization rules with GRID-2; the defect can be fixed before any moves. |
| GRID-4   | Handle endpoint/stats query failures explicitly | Decide partial-data behavior; independent of relocation.                             |
| GRID-5   | Trim the table interface                        | After GRID-1 establishes table ownership.                                            |
| MON-1    | Colocate Monitor-only helpers                   | Independent; preserve its legacy data contracts.                                     |
| MON-2    | Expose Monitor query failures                   | Independent; retain as a separate legacy Monitor task.                               |
| SHARED-1 | Remove the unused slug component                | Independent.                                                                         |
| SHARED-2 | Normalize clipboard behavior                    | Coordinate with API-1; operation stays shared, API button stays local.               |
| SHELL-1  | Colocate metadata-only formatting               | Independent.                                                                         |

## ORCA API page

### API-1 — Colocate page-only code (complete)

- [x] Move `components/shared/copy-to-clipboard-button.tsx` to `app/api/copy-to-clipboard-button.tsx`.
- [x] Move `lib/highlight-json.ts` to `app/api/highlight-json.ts`.
- [x] Move `lib/highlight-json.test.ts` alongside it.
- [x] Update the page, preview, and test imports.

| Code             | Actual consumer                                    |
| ---------------- | -------------------------------------------------- |
| Copy button      | `app/api/page.tsx` only                            |
| JSON highlighter | `app/api/client-api-preview.tsx` and its test only |

The existing `page.tsx`, `client-api-preview.tsx`, and `public-api.ts` already have the right owner. Keep all API-page-only presentation and helpers under `app/api`; do not create `features/api-docs`.

The page intentionally documents the v2 HTTP interface. The backend's internal v3 migration does not make its route or `scripts/validate-public-api.ts` obsolete. That validation script is a tooling entry point, not page implementation.

## Endpoints grid

### GRID-1 — Collect grid-owned implementation

The grid's implementation, tests, styles, and slug-search documentation are now colocated in `features/endpoints-data-grid`.

**Current structure:**

```text
features/endpoints-data-grid/
  attributes/   # Registry, groups, badges/details, filter menus, facet state and test
  data/         # Query hooks and endpoint/stats join
  data-grid/    # ReUI table, skeleton/shimmer and README.md
  popovers/     # Popover handle/card and endpoint UUID
  slug-search/  # slug-search.ts and its test
  ...           # Page, grid, columns, controls, footer, query/focus/sort state and query test
```

The table below records the original locations of the moved files.

| Current path                             | Actual consumers                                     | Local grouping                  |
| ---------------------------------------- | ---------------------------------------------------- | ------------------------------- |
| `lib/v3/entities.ts`                     | Grid page                                            | Data queries                    |
| `lib/v3/grid-endpoints.ts`               | Grid page/table/columns and attributes               | Data join and inferred row type |
| `lib/attributes.tsx`                     | Grid filters, menus, badges                          | Attributes                      |
| `lib/attribute-groups.ts`                | Column slots, menus, facet state                     | Attributes                      |
| `components/shared/attribute-badge.tsx`  | Grid columns and popover handle                      | Attributes                      |
| `components/shared/color-icon-badge.tsx` | Attribute badge; registry type import                | Attributes                      |
| `components/shared/data-list.tsx`        | Attribute badge popover                              | Attribute details               |
| `components/shared/inline-code.tsx`      | Attribute descriptions                               | Attribute details               |
| `components/shared/endpoint-uuid.tsx`    | Grid columns and popover handle                      | Popovers                        |
| `components/shared/popover-card.tsx`     | Grid popover handle, attribute badge, UUID           | Popovers                        |
| `components/data-grid/*`                 | Grid page implementation; its internal table helpers | Table                           |
| `components/shared/shimmer.tsx`          | Data-grid skeleton                                   | Table                           |
| `lib/slug-search.ts` and its test        | Grid rows                                            | Search                          |

- [x] Move these files and their tests into the chosen owner; use subdirectories where they improve navigation.
- [x] Preserve the customized ReUI table's provenance, now recorded in `data-grid/README.md`.
- [x] Update imports and path-specific configuration. The data-grid Knip ignore has since been removed.
- [x] Move slug-search documentation to `features/endpoints-data-grid/slug-search/README.md` and update it for the current fields, matching, and ranking rules.
- [x] Move grid-specific highlight rules to `features/endpoints-data-grid/styles.css`, imported by `app/globals.css`. Preserve selectors and the utilities layer; keep application theme tokens global.

Preserve the endpoint-ID join and suppression of stats on unlisted endpoints in `buildGridEndpoints`. Keep punctuation-aware slug search semantics. Preserve detached-trigger/hover popovers and table virtualization, pinning, and resizing.

`popovers/endpoint-uuid.tsx` now imports the grid URL builder within its own feature, removing the former shared-to-feature dependency.

### GRID-2 — Centralize URL policy

Evidence:

- `controls.tsx:13–18,39–62` and `endpoints-empty-state.tsx:19–51` duplicate parser definitions, options, and the full reset patch.
- Query, focus, facet, and sort hooks each own related parsing/options.
- `features/entity-overview/hrefs.ts:5–31` maintains the grid's query-key allowlist and UUID preservation policy.
- The UUID popover imports a pure URL builder from a hook file.

- [ ] Give the grid a pure `query-state.ts`/`links.ts` interface for parsers, known keys, reset patches, normalization, and href construction.
- [ ] Have controls and the empty state use the same reset definition.
- [ ] Move destination-specific grid link policy out of Entity Overview; expose a grid-owned link builder.
- [ ] Preserve the difference between a fresh grid URL and a contextual link retaining current filters.

Keep focused hooks for independent subscriptions. Centralized definitions do not require one broad hook that subscribes every control to every parameter. Coordinate facet normalization with GRID-3.

### GRID-3 — Fix conflicting facet state and counts

Evidence: `features/endpoints-data-grid/attributes/use-endpoint-facet-state.ts:28–38,74–90,114–128,135–136`.

For `?has=image_input&not=image_input`:

- `resolveFilterMode` checks `has` first, so the modality control displays **include**.
- `toFacetFilters` applies `not` last, so row filtering applies **exclude**.
- Attribute counts can count duplicate/conflicting entries more than once because they count concatenated raw arrays.

- [ ] Choose one collision rule for include/exclude conflicts.
- [ ] Normalize unknown values, duplicates, and conflicts into one facet state.
- [ ] Derive filtering, toggles, and counts from that state.
- [ ] Extend the existing facet tests with conflicting and duplicate URL values.

### GRID-4 — Distinguish query failures from empty data

Evidence: `features/endpoints-data-grid/endpoints-data-grid-page.tsx:8–13`.

The page uses only query `data` and `isPending`. An endpoint request failing without cached data becomes `[]` and can render the filter-empty state once pending clears. A stats failure can silently remove readings while otherwise rendering endpoints. Entity Overview and pricing history already distinguish failures and offer retry.

- [ ] Decide whether a stats failure permits a clearly identified partial result.
- [ ] Give grid data loading an explicit contract for data, loading, and failures.
- [ ] Preserve usable cached data during refresh failures.
- [ ] Verify endpoint failure, stats failure, and genuine empty results are distinguishable.

### GRID-5 — Light table cleanup (complete)

Scope: retain working configuration options so the feature can change how it uses the table. Major restructuring and removing options solely because they have no current caller are out of scope.

- [x] Remove vestigial `recordCount` from props, context, and the grid caller; the footer already derives its count from the table.
- [x] Make the three unused exported types private after removing the Knip ignore.
- [x] Remove the redundant `string` union from `ReactNode`.
- [x] Explain the table virtualizer's lint suppression while preserving its React Compiler opt-out.
- [x] Return the shadcn `use-mobile.ts` hook to `hooks/use-mobile.ts` and update its import.

Keep the existing row-click, column metadata, styling, and layout options, along with the virtualization, pinning, and resizing implementation.

## Monitor

### MON-1 — Colocate Monitor-only helpers

| Current path                              | Actual consumer          | Action                                      |
| ----------------------------------------- | ------------------------ | ------------------------------------------- |
| `features/monitor/or-entity-combobox.tsx` | Monitor `filter-bar.tsx` | Colocated; existing name preserved.         |
| `features/monitor/use-infinite-scroll.ts` | Monitor page             | Colocated; load-more documentation updated. |

- [x] Move both helpers and update imports.
- [x] Replace the infinite-scroll comment's outdated `usePaginatedQuery` explanation with the current load-more contract.

Retain legacy `api.monitor`, model/provider filter queries, change types, and grouping/formatting behavior until Monitor's replacement is ready. Its combobox matching differs from grid slug search; colocation does not imply consolidating the search engines.

### MON-2 — Expose query failures

`features/monitor/use-monitor.ts:67–107` drops feed and batch query errors. Keep this as a Monitor-owned correction rather than combining it with the grid's empty-state implementation.

- [ ] Expose feed/batch failures to the page.
- [ ] Distinguish loading, genuine empty results, and failed or partially failed batches.

## Remaining shared code and shell helpers

### SHARED-1 — Delete the unused slug component (complete)

- [x] Delete `components/shared/copyable-entity-slug.tsx`; repository-wide search confirmed it had no consumers.

### SHARED-2 — Normalize clipboard behavior (complete)

Clipboard audit (2026-09-14): repository-wide searches for clipboard APIs, copy handlers, icons, and labels found three active copy actions and one unused component.

| Surface                                                            | Payload                                                  | Implementation                               |
| ------------------------------------------------------------------ | -------------------------------------------------------- | -------------------------------------------- |
| `features/entity-overview/layout.tsx`                              | Full entity slug/identifier                              | Shared hook; caller-specific success message |
| `features/endpoints-data-grid/popovers/endpoint-uuid.tsx`          | Full endpoint UUID, not its six-character display prefix | Shared hook; caller-specific success message |
| `app/api/copy-to-clipboard-button.tsx`, used by `app/api/page.tsx` | API URL                                                  | Local button using shared hook               |
| `components/shared/copyable-entity-slug.tsx`                       | Entity slug                                              | Unused; removed under SHARED-1               |

The API JSON sample has no copy action. No other clipboard writers or legacy `execCommand` implementations were found. All Sonner usage was part of clipboard feedback or the root toaster.

**Decision:** share the operation and toast feedback through `useCopyToClipboard`, keeping buttons with their owners. The earlier inline-feedback/timer checklist was a proposal; standardized toast feedback removes the need for button-specific success state, animations, and timeout cleanup.

**Toast alignment:** `shadcn info --json` identifies this project as `base: "base"`, style `base-mira`. Current [shadcn Base UI Toast documentation](https://ui.shadcn.com/docs/components/base/toast) uses the native Base UI toast manager (`toast.add`) and `Toaster`; the old Base UI Sonner documentation resolves to Toast. This is base-specific guidance, not a universal replacement for Radix/React Aria projects.

- [x] Consolidate clipboard writes and success/error feedback in `hooks/use-copy-to-clipboard.ts`.
- [x] Show success only after the write resolves; show a manual-copy recovery message on failure and retain console diagnostics.
- [x] Replace the API button's local operation, checkmark state, and timer with the shared hook.
- [x] Rename the hook to `.ts` and rely on React Compiler instead of manual `useCallback`.
- [x] Install shadcn's Base UI toast component, wire the root toaster, and remove the Sonner component and dependency. Use the upstream bottom-right positioning and inherited dark theme.
- [x] Give the UUID copy control an explicit accessible action label.

The operation remains shared between Entity Overview, the grid UUID popover, and the API button. The button's presentation belongs in `app/api` as specified by API-1.

### SHELL-1 — Colocate metadata-only formatting

- [ ] Move `withEnvironmentPrefix` from `lib/utils.ts:29` into root metadata/layout or a focused metadata helper; only root metadata uses it.

### Code that should remain shared

These are retention decisions, not relocation tasks.

| Code                                    | Role / consumers                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| `components/shared/entity-avatar.tsx`   | Common entity presentation, used by `EntityIdentity` and a separate route consumer    |
| `components/shared/entity-identity.tsx` | Grid, Monitor, pricing history, Entity Overview, Monitor combobox                     |
| `components/shared/inline-markdown.tsx` | Monitor field/event rendering and Entity Overview descriptions                        |
| `components/shared/search-input.tsx`    | Common input/clear/focus behavior used by grid controls and a separate route consumer |
| `components/shared/client-only.tsx`     | Grid and Monitor route wrappers                                                       |
| `lib/href.ts`                           | Parameter cloning/selection and href serialization for overview and pricing links     |
| `lib/utils.ts` — `cn`                   | UI primitives and application UI throughout; preserve the shadcn-configured path      |

## Ownership rules for the remaining work

1. Route-only implementation belongs beside its route. API-page-only code belongs in `app/api`.
2. Product implementation belongs with its owning product module. Choose a module's home before moving its scattered helpers.
3. Shared code should have real cross-owner reuse and should not import product implementation.
4. Cross-product imports should use explicit entry files: overview trigger, destination links, pricing preload, and overlay/provider composition.
5. Pure URL helpers should remain usable independently of client components. Avoid barrels that combine them with chart or overlay imports.
6. Keep tests beside the code they exercise. A test importer does not establish cross-owner reuse.

Entity Overview should delegate destination-specific navigation to the grid and Monitor. Pricing history already has well-localized data, colors, tests, and an ECharts adapter. Preserve `/beta/pricing-history/[...modelId]` as an active compatibility redirect, including its helper tests, when moving pricing URL code.
