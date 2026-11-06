/*
 * The panel layout model. Results is the primary Panel and is always docked; Endpoint and Filters are
 * secondary. Each Panel has an intrinsic width (Results a minimum), and the page's width decides where
 * each secondary Panel goes: docked beside Results, or in a sheet. Nothing floats over Results, which
 * would hide the columns it scrolls under. Priority runs Results, then Endpoint, then Filters: a selected
 * endpoint keeps a column before Filters does, because comparing endpoints means reading the Table and
 * the selection side by side, while filters are set and left. The breakpoints are not chosen; they are
 * the widths at which the candidate layouts stop fitting.
 */

/** Pixels between Panels, and between the Panels and the page's edge. */
export const PANEL_GAP = 8

/** The Filters panel's width when docked: `w-68`. */
export const FILTERS_WIDTH = 272

/** The Endpoint panel's width when docked: `w-85`. */
export const ENDPOINT_WIDTH = 340

/** The narrowest Results panel beside a docked Panel: its scope bar's counts and the Model column. */
export const RESULTS_MIN_WIDTH = 480

/**
 * Where a secondary Panel sits.
 *
 * - `docked`: a column beside Results.
 * - `sheet`: a modal sheet over the page: from the side for Filters, from the bottom for Endpoint.
 */
export type Placement = 'docked' | 'sheet'

export interface PanelLayout {
  endpoint: Placement
  filters: Placement
}

/** Every Panel docked. */
const WIDE: PanelLayout = { endpoint: 'docked', filters: 'docked' }

/** Filters give up their column so the selected endpoint keeps one. */
const DETAIL: PanelLayout = { endpoint: 'docked', filters: 'sheet' }

/** The selected endpoint gives up its column, not Filters': it opens in a sheet. */
const FILTERS_BESIDE: PanelLayout = { endpoint: 'sheet', filters: 'docked' }

/** A phone: Results alone, everything else in sheets. */
const COMPACT: PanelLayout = { endpoint: 'sheet', filters: 'sheet' }

/** The layouts in order of preference; `COMPACT` takes whatever none of them fits. */
const CANDIDATES = [WIDE, DETAIL, FILTERS_BESIDE] as const

/**
 * The narrowest page, in CSS pixels, that fits a layout: the page's padding, each docked Panel and its
 * gap, and Results at its minimum. The Endpoint panel takes no room while nothing is selected.
 */
export function minimumWidth(layout: PanelLayout, endpointShown: boolean): number {
  const filters = layout.filters === 'docked' ? FILTERS_WIDTH + PANEL_GAP : 0
  const endpoint = endpointShown && layout.endpoint === 'docked' ? ENDPOINT_WIDTH + PANEL_GAP : 0

  return 2 * PANEL_GAP + filters + endpoint + RESULTS_MIN_WIDTH
}

/** Where each secondary Panel goes on a page this many CSS pixels wide. */
export function panelLayout(width: number, endpointShown: boolean): PanelLayout {
  return CANDIDATES.find((layout) => width >= minimumWidth(layout, endpointShown)) ?? COMPACT
}

/**
 * Every width at which `panelLayout` can change, ascending. Between two of them it returns the same
 * layout, so a page width can be floored to one (see `breakpointFloor`) without changing the result.
 */
export const BREAKPOINTS: readonly number[] = [
  ...new Set(
    CANDIDATES.flatMap((layout) => [minimumWidth(layout, false), minimumWidth(layout, true)]),
  ),
].toSorted((left, right) => left - right)

/** The widest breakpoint no wider than the page, or 0 below them all. */
export function breakpointFloor(width: number): number {
  return BREAKPOINTS.findLast((breakpoint) => breakpoint <= width) ?? 0
}

/**
 * A sheet's session: whether the user has it open, and the placement it was opened in. A sheet is
 * open only while its Panel stays in the placement the user opened it in; see `sheetSessionIn`.
 */
export interface SheetSession {
  open: boolean
  placement: Placement
}

/** A session that has not been opened, in a placement. */
export const closedSession = (placement: Placement): SheetSession => ({ open: false, placement })

/**
 * The session as it stands once its Panel is in `placement`. A Panel that leaves its sheet ends the
 * session, so docking and returning to a sheet finds it closed, not reopened. Returns the same session
 * when the placement has not changed.
 */
export function sheetSessionIn(session: SheetSession, placement: Placement): SheetSession {
  return session.placement === placement ? session : closedSession(placement)
}

/** The narrowest page that docks Filters while nothing is selected. */
export const FILTERS_DOCK_WIDTH = minimumWidth(WIDE, false)

/**
 * Hides the docked Filters panel below `FILTERS_DOCK_WIDTH` before scripts run. The loading skeleton
 * is server-rendered for a page of unknown width, so it lays out as `WIDE` and leaves this media
 * query (`max-[N]` is `width < N`) to keep a phone from showing it squeezed. Tailwind reads the
 * literal; a test keeps it equal to the breakpoint.
 */
export const DOCKED_FILTERS_MEDIA_CLASS = 'max-[776px]:hidden'
