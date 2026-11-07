/*
 * The panel layout model. Results is the primary Panel and is always docked. Filters are the one
 * secondary Panel that takes a column: docked beside Results where both fit, or in a drawer where they
 * do not. The Endpoint panel never takes a column: it floats over Results in a drawer at every width,
 * so selecting an endpoint, or moving the selection with ↑/↓, never reflows the Table or redraws the
 * plot. It floats beside the Table only where Results keeps the Model column and a band of figures
 * clear of it; otherwise it rises from the bottom. The breakpoints are not chosen; they are the
 * widths at which a layout stops fitting.
 */

/** Pixels between Panels, and between the Panels and the page's edge. */
export const PANEL_GAP = 8

/** The Filters panel's width when docked: `w-68`. */
export const FILTERS_WIDTH = 272

/** The Endpoint drawer's width when it floats beside the Table: the registry Drawer's `24rem`. */
export const ENDPOINT_WIDTH = 384

/** The narrowest Results panel beside a docked Panel: its scope bar's counts and the Model column. */
export const RESULTS_MIN_WIDTH = 480

/**
 * The Table's sticky Model column. Where the Endpoint drawer can float beside the Table it is exactly
 * this wide (see `modelColumnFixed`); elsewhere it takes what the fixed-width columns leave of the
 * Table's 190 (760px) minimum, which is this too.
 */
export const MODEL_COLUMN_WIDTH = 180

/** The Results frame's border. Its leading edge sits before the Model column; the drawer covers the trailing one. */
export const RESULTS_BORDER_WIDTH = 1

/** The Table's numeric columns are 68px each (Throughput is 56px). */
const FIGURE_COLUMN_WIDTH = 68

/**
 * The band of the Table that must stay clear beside a floating Endpoint drawer, after the Model
 * column: the width of the three price columns (Input, Output, Cache read). The Provider column
 * comes first in that band, so it shows the Provider and the start of the prices; the rest scroll
 * in clear of the drawer (see `tableTrailingInset`).
 */
export const MIN_VISIBLE_FIGURES_WIDTH = 3 * FIGURE_COLUMN_WIDTH

/**
 * The Results width that fits the Endpoint drawer beside the Table: the drawer, then the frame's
 * leading border, the Model column, and a band of figures clear of it. The drawer covers the end of
 * Results, trailing border included, so the rest is what the Table shows.
 */
export const ENDPOINT_RESULTS_WIDTH =
  ENDPOINT_WIDTH + RESULTS_BORDER_WIDTH + MODEL_COLUMN_WIDTH + MIN_VISIBLE_FIGURES_WIDTH

/**
 * Where the Filters panel sits.
 *
 * - `docked`: a column beside Results.
 * - `collapsed`: docked, but the user has slid it away; it takes no width.
 * - `drawer`: a modal drawer from the left, on a page too narrow to dock it.
 */
export type FiltersPlacement = 'docked' | 'collapsed' | 'drawer'

/**
 * The edge the Endpoint drawer floats from: `right`, beside the Table, where Results is wide enough
 * to keep its Model column and a band of figures visible beside it (`ENDPOINT_RESULTS_WIDTH`);
 * `bottom` on a phone or where docked Filters leave Results too narrow.
 */
export type EndpointSide = 'right' | 'bottom'

export interface PanelLayout {
  endpoint: EndpointSide
  filters: FiltersPlacement
}

/** The narrowest page that docks Filters beside Results, padding and gaps included. */
export const FILTERS_DOCK_WIDTH = 2 * PANEL_GAP + FILTERS_WIDTH + PANEL_GAP + RESULTS_MIN_WIDTH

/** The narrowest page whose Results panel, with Filters collapsed or in a drawer, fits the Endpoint drawer. */
export const ENDPOINT_SIDE_WIDTH = 2 * PANEL_GAP + ENDPOINT_RESULTS_WIDTH

/** The narrowest page whose Results panel, beside docked Filters, fits the Endpoint drawer. */
export const ENDPOINT_SIDE_DOCKED_WIDTH =
  2 * PANEL_GAP + FILTERS_WIDTH + PANEL_GAP + ENDPOINT_RESULTS_WIDTH

/**
 * Where each secondary Panel goes on a page this many CSS pixels wide. `filtersCollapsed` is the
 * user's preference for docked Filters; a page too narrow to dock them puts them in a drawer whatever
 * it says. The Endpoint drawer's edge follows from the Filters, whose column takes Results' width.
 */
export function panelLayout(width: number, filtersCollapsed: boolean): PanelLayout {
  const filters = filtersPlacement(width, filtersCollapsed)
  const endpointSideWidth = filters === 'docked' ? ENDPOINT_SIDE_DOCKED_WIDTH : ENDPOINT_SIDE_WIDTH

  return {
    endpoint: width < endpointSideWidth ? 'bottom' : 'right',
    filters,
  }
}

function filtersPlacement(width: number, collapsed: boolean): FiltersPlacement {
  if (width < FILTERS_DOCK_WIDTH) {
    return 'drawer'
  }

  return collapsed ? 'collapsed' : 'docked'
}

/**
 * Whether the Model column holds `MODEL_COLUMN_WIDTH` and the Provider column takes the Table's
 * surplus width. That is wherever the Endpoint drawer can float beside the Table, selected or not, so
 * selecting never moves a column; it keeps the clear band at `MIN_VISIBLE_FIGURES_WIDTH`, which a
 * Model column absorbing the surplus would shrink to a constant 197px. Elsewhere, and where Provider
 * folds into the Model cell, Model takes the surplus.
 */
export function modelColumnFixed(layout: PanelLayout): boolean {
  return layout.endpoint === 'right'
}

/**
 * The room the Table's scroll area leaves after its last column while the Endpoint drawer floats
 * over it, so every column can scroll out from under the drawer. A bottom drawer is modal and covers
 * the Table's width, so it leaves none.
 */
export function tableTrailingInset(layout: PanelLayout, endpointShown: boolean): number {
  return endpointShown && layout.endpoint === 'right' ? ENDPOINT_WIDTH + PANEL_GAP : 0
}

/**
 * Every width at which `panelLayout` can change, ascending. Between two of them it returns the same
 * layout, so a page width can be floored to one (see `breakpointFloor`) without changing the result.
 */
export const BREAKPOINTS: readonly number[] = [
  FILTERS_DOCK_WIDTH,
  ENDPOINT_SIDE_WIDTH,
  ENDPOINT_SIDE_DOCKED_WIDTH,
].toSorted((left, right) => left - right)

/** The widest breakpoint no wider than the page, or 0 below them all. */
export function breakpointFloor(width: number): number {
  return BREAKPOINTS.findLast((breakpoint) => breakpoint <= width) ?? 0
}

/**
 * A drawer's session: whether the user has it open, and the placement it was opened in. A drawer is
 * open only while its Panel stays in the placement the user opened it in; see `drawerSessionIn`.
 */
export interface DrawerSession {
  open: boolean
  placement: FiltersPlacement
}

/** A session that has not been opened, in a placement. */
export const closedSession = (placement: FiltersPlacement): DrawerSession => ({
  open: false,
  placement,
})

/**
 * The session as it stands once its Panel is in `placement`. A Panel that leaves its drawer ends the
 * session, so docking and returning to a drawer finds it closed, not reopened. Returns the same
 * session when the placement has not changed.
 */
export function drawerSessionIn(
  session: DrawerSession,
  placement: FiltersPlacement,
): DrawerSession {
  return session.placement === placement ? session : closedSession(placement)
}

/*
 * The server renders the loading skeleton for a page of unknown width, so it lays out for a desktop
 * and leaves these media queries (`max-[N]` is `width < N`) to fix a phone's layout before scripts
 * run. Tailwind reads the literals; a test keeps them at the breakpoint. The loaded page uses them
 * too, so the two can never disagree.
 */

/** Hides the docked Filters panel where the layout puts it in a drawer. */
export const DOCKED_FILTERS_MEDIA_CLASS = 'max-[776px]:hidden'

/**
 * Where Results is the only docked Panel, the page drops its gutter: Results runs to the screen's
 * edges and under the notch and home indicator, and pads its own bars clear of them
 * (`FLUSH_TOP_MEDIA_CLASS`, `FLUSH_BOTTOM_MEDIA_CLASS`). The left and right safe areas, which a
 * phone held upright does not have, stay page padding.
 */
export const FLUSH_PAGE_MEDIA_CLASS =
  'max-[776px]:pt-0 max-[776px]:pr-[env(safe-area-inset-right)] max-[776px]:pb-0 max-[776px]:pl-[env(safe-area-inset-left)]'

/** The Results frame's border and corners, dropped where it runs to the screen's edges. */
export const FLUSH_FRAME_MEDIA_CLASS = 'max-[776px]:rounded-none max-[776px]:border-0'

/** The scope bar's top padding clears the notch where Results runs under it. */
export const FLUSH_TOP_MEDIA_CLASS = 'max-[776px]:pt-[calc(0.25rem+env(safe-area-inset-top))]'

/** The status bar's bottom padding clears the home indicator where Results runs under it. */
export const FLUSH_BOTTOM_MEDIA_CLASS =
  'max-[776px]:h-[calc(1.75rem+env(safe-area-inset-bottom))] max-[776px]:pb-[env(safe-area-inset-bottom)]'
