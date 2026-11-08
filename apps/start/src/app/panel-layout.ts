/*
 * The panel layout model. Results is the primary Panel and is always docked. Filters are the one
 * secondary Panel that takes a column: docked beside Results where both fit, or in a drawer where they
 * do not. The Endpoint panel never takes a column: it floats over Results in a drawer at every width,
 * so selecting an endpoint, or moving the selection with ↑/↓, never reflows the Table or redraws the
 * plot. It floats beside the Table only where Results keeps the Table's leading columns (Model, Input
 * and Output) clear of it; otherwise it rises from the bottom. The Table fills Results at every width
 * and folds Provider into the Model cell below one Results width. The breakpoints are not chosen; they
 * are the widths at which a layout stops fitting.
 */

/** Pixels between Panels, and between the Panels and the page's edge. */
export const PANEL_GAP = 8

/** The Filters panel's width when docked: `w-68`. */
export const FILTERS_WIDTH = 272

/** The Endpoint drawer's width when it floats beside the Table: the registry Drawer's `24rem`. */
export const ENDPOINT_WIDTH = 384

/** The narrowest Results panel beside a docked Panel: its scope bar's counts and the Model column. */
export const RESULTS_MIN_WIDTH = 480

/** The Results frame's border. Its leading edge sits before the Model column; the drawer covers the trailing one. */
export const RESULTS_BORDER_WIDTH = 1

/*
 * The Table's columns fill the Results panel at every width, in a fixed layout, by one rule: Model
 * grows first, to its cap; Provider, where it has a column, has its own width; and the six figure
 * columns share what is left evenly, so the figures stay evenly spaced and right-aligned under their
 * headers. `tableColumnWidths` is the rule in pixels; the `<col>`s express it in CSS
 * (`MODEL_COLUMN_WIDTH_CSS`, and figure columns without a width, which a fixed table shares evenly).
 */

/** The Table's sticky Model column at its narrowest. */
export const MODEL_COLUMN_WIDTH = 180

/**
 * The widest the Model column grows: a model name at the catalogue's 99th percentile (250px with its
 * avatar and padding, measured on the live catalogue). Past it the figures take the surplus.
 */
export const MODEL_COLUMN_MAX_WIDTH = 256

/** The Provider column: a provider name with its quantization and tier tags at the 99th percentile (207px). */
export const PROVIDER_COLUMN_WIDTH = 208

/** The numeric columns: Input, Output, Cache read, Throughput, Latency, Context. */
export const FIGURE_COLUMN_COUNT = 6

/** A figure column at its narrowest: a price such as `$12.500` and its padding. */
export const FIGURE_COLUMN_MIN_WIDTH = 68

/** The figures at their narrowest, which Model leaves room for before it grows. */
const FIGURES_MIN_WIDTH = FIGURE_COLUMN_COUNT * FIGURE_COLUMN_MIN_WIDTH

/**
 * The Table at its narrowest, folded: Model at its narrowest and the figures at theirs. A narrower
 * panel scrolls it sideways (`TABLE_MIN_WIDTH_CLASS`).
 */
export const TABLE_MIN_WIDTH = MODEL_COLUMN_WIDTH + FIGURES_MIN_WIDTH

/**
 * The Model column's width, as CSS, from the Results container's width (`100cqw`): what the figures'
 * minimum leaves, between `MODEL_COLUMN_WIDTH` and `MODEL_COLUMN_MAX_WIDTH`. Where Provider has a
 * column the panel is wide enough that Model is at its cap. It depends on no layout or selection, so
 * the server's HTML has it, and opening the drawer moves nothing.
 */
export const MODEL_COLUMN_WIDTH_CSS = `clamp(${MODEL_COLUMN_WIDTH}px, 100cqw - ${FIGURES_MIN_WIDTH}px, ${MODEL_COLUMN_MAX_WIDTH}px)`

export interface TableColumnWidths {
  model: number
  /** Zero where Provider is folded into the Model cell. */
  provider: number
  /** Each of the six figure columns. */
  figure: number
}

/**
 * The Table's column widths, in pixels, in a Results panel this wide, border included, folded or not:
 * the rule the `<col>`s express in CSS, for the breakpoints and tests. The table is the container's
 * width, and no narrower than `TABLE_MIN_WIDTH`.
 */
function columnWidths(results: number, folded: boolean): TableColumnWidths {
  const table = Math.max(TABLE_MIN_WIDTH, results - 2 * RESULTS_BORDER_WIDTH)

  const model = Math.min(
    MODEL_COLUMN_MAX_WIDTH,
    Math.max(MODEL_COLUMN_WIDTH, table - FIGURES_MIN_WIDTH),
  )

  const provider = folded ? 0 : PROVIDER_COLUMN_WIDTH

  return { figure: (table - model - provider) / FIGURE_COLUMN_COUNT, model, provider }
}

/** The Table's column widths, in pixels, in a Results panel this wide (see `columnWidths`). */
export function tableColumnWidths(results: number): TableColumnWidths {
  return columnWidths(results, tableFolds(results))
}

/**
 * Whether a Results panel this wide, its Table folded or not, keeps the Table's leading columns clear
 * of a floating Endpoint drawer: Model, Provider where it has a column, and the first two figures,
 * Input and Output. The drawer covers the end of Results, trailing border included; the rest, after
 * the leading border, is what the Table shows. The columns under it scroll out (`tableTrailingInset`).
 */
export function keepsLeadingColumnsClear(results: number, folded: boolean): boolean {
  const { figure, model, provider } = columnWidths(results, folded)

  return results - ENDPOINT_WIDTH - RESULTS_BORDER_WIDTH >= model + provider + 2 * figure
}

/** The narrowest whole width at which a test that holds from there on starts to hold. */
function narrowest(holds: (width: number) => boolean): number {
  const width = Array.from({ length: 4096 }, (_, index) => index).find(holds)

  if (width === undefined) {
    throw new Error('No width up to 4096px satisfies the layout')
  }

  return width
}

/**
 * The narrowest Results panel the Endpoint drawer floats beside: where the folded Table keeps Model,
 * Input and Output clear of it.
 */
export const ENDPOINT_RESULTS_WIDTH = narrowest((results) =>
  keepsLeadingColumnsClear(results, true),
)

/**
 * The narrowest Results panel whose Table gives Provider its own column: where the unfolded Table
 * keeps Model, Provider, Input and Output clear of the drawer, so unfolding never hides a figure the
 * folded Table showed beside it. Below it Provider folds into the Model cell's second line. It is the
 * Table's one fold, a function of the Results width alone.
 */
export const UNFOLD_RESULTS_WIDTH = narrowest((results) => keepsLeadingColumnsClear(results, false))

/**
 * `UNFOLD_RESULTS_WIDTH` as the Results container query sees it: the frame's content box, inside its
 * two borders. The fold's classes in the Table's columns (`FOLDED_CLASS`) are this width in Tailwind.
 */
export const UNFOLD_CONTAINER_WIDTH = UNFOLD_RESULTS_WIDTH - 2 * RESULTS_BORDER_WIDTH

/** Whether a Results panel this wide folds Provider into the Model cell. */
export function tableFolds(results: number): boolean {
  return results < UNFOLD_RESULTS_WIDTH
}

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
 * to keep the Table's leading columns visible beside it (`ENDPOINT_RESULTS_WIDTH`);
 * `bottom` on a phone or where docked Filters leave Results too narrow.
 */
export type EndpointSide = 'right' | 'bottom'

export interface PanelLayout {
  endpoint: EndpointSide
  filters: FiltersPlacement
}

/** The narrowest page that docks Filters beside Results, padding and gaps included. */
export const FILTERS_DOCK_WIDTH = 2 * PANEL_GAP + FILTERS_WIDTH + PANEL_GAP + RESULTS_MIN_WIDTH

/** The narrowest page whose Results panel, with Filters collapsed, fits the Endpoint drawer. */
export const ENDPOINT_SIDE_WIDTH = 2 * PANEL_GAP + ENDPOINT_RESULTS_WIDTH

/** The narrowest page whose Results panel, beside docked Filters, fits the Endpoint drawer. */
export const ENDPOINT_SIDE_DOCKED_WIDTH =
  2 * PANEL_GAP + FILTERS_WIDTH + PANEL_GAP + ENDPOINT_RESULTS_WIDTH

/**
 * Where each secondary Panel goes on a page this many CSS pixels wide. `filtersCollapsed` is the
 * user's preference for docked Filters; a page too narrow to dock them puts them in a drawer whatever
 * it says. The Endpoint drawer's edge follows from the Results width the Filters leave.
 */
export function panelLayout(width: number, filtersCollapsed: boolean): PanelLayout {
  const filters = filtersPlacement(width, filtersCollapsed)

  return {
    endpoint: endpointSide(width, filters),
    filters,
  }
}

/**
 * The Results panel's width, border included, on a page this wide with Filters where they are. With
 * Filters in a drawer Results runs flush, the page's full width.
 */
export function resultsWidth(width: number, filters: FiltersPlacement): number {
  if (filters === 'drawer') {
    return width
  }

  return width - 2 * PANEL_GAP - (filters === 'docked' ? FILTERS_WIDTH + PANEL_GAP : 0)
}

/**
 * The drawer floats beside the Table where Results is at least `ENDPOINT_RESULTS_WIDTH` wide, and only
 * beside a framed Results: a flush one runs under the drawer's page inset, and is a phone's layout.
 */
function endpointSide(width: number, filters: FiltersPlacement): EndpointSide {
  return filters !== 'drawer' && resultsWidth(width, filters) >= ENDPOINT_RESULTS_WIDTH
    ? 'right'
    : 'bottom'
}

function filtersPlacement(width: number, collapsed: boolean): FiltersPlacement {
  if (width < FILTERS_DOCK_WIDTH) {
    return 'drawer'
  }

  return collapsed ? 'collapsed' : 'docked'
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
export const FLUSH_TOP_MEDIA_CLASS =
  'max-[776px]:pt-[calc(var(--results-header-inset)+env(safe-area-inset-top))]'

/** The status bar's bottom padding clears the home indicator where Results runs under it. */
export const FLUSH_BOTTOM_MEDIA_CLASS =
  'max-[776px]:h-[calc(1.75rem+env(safe-area-inset-bottom))] max-[776px]:pb-[env(safe-area-inset-bottom)]'
