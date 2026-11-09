import { Drawer, DrawerContent, DrawerTitle } from '@orca/ui/components/drawer'
import { cn } from 'cn'
import {
  Activity,
  createContext,
  use,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { ComponentProps, ReactNode } from 'react'

import { setFiltersCollapsed, useFiltersCollapsed } from './filters-preference'
import {
  BREAKPOINTS,
  breakpointFloor,
  closedSession,
  DOCKED_FILTERS_MEDIA_CLASS,
  drawerSessionIn,
  panelLayout,
} from './panel-layout'
import type { FiltersPlacement, PanelLayout } from './panel-layout'

/*
 * The panel layout primitive. `usePanelLayout` reads where each Panel goes from the page's width and
 * the user's Filters preference; `FiltersSlot` and `EndpointDrawer` put the secondary Panels there,
 * and a Panel's frame reads `usePlacement` to drop the border and width a drawer already provides.
 * The same Panel components render in every layout, and nothing about the layout is stored, so
 * resizing the window can never leave it out of date. The one thing kept is whether the user has the
 * Filters drawer open, and that lasts only as long as Filters stay in it (see `useDrawerSession`).
 */

function subscribe(onChange: () => void) {
  const queries = BREAKPOINTS.map((width) => matchMedia(`(width >= ${width}px)`))

  for (const query of queries) {
    query.addEventListener('change', onChange)
  }

  return () => {
    for (const query of queries) {
      query.removeEventListener('change', onChange)
    }
  }
}

/** The page's width floored to a breakpoint, so the snapshot changes only when a media query does. */
const clientWidth = (): number => breakpointFloor(window.innerWidth)

/** The server lays out the loading skeleton for a desktop; see `DOCKED_FILTERS_MEDIA_CLASS`. */
const serverWidth = (): number => Number.POSITIVE_INFINITY

/**
 * Where each secondary Panel goes at the page's current width. Re-renders only when a breakpoint is
 * crossed or the user collapses or expands Filters.
 */
export function usePanelLayout(): PanelLayout {
  const width = useSyncExternalStore(subscribe, clientWidth, serverWidth)

  return panelLayout(width, useFiltersCollapsed())
}

/**
 * Whether the user has a Panel's drawer open, for a Panel currently in `placement`. The session ends
 * when the Panel leaves its drawer: Filters opened on a phone and docked by widening the window must
 * not reopen when the window narrows again. React rebuilds the render when state is set while
 * rendering, so the stale session never reaches the page.
 */
export function useDrawerSession(placement: FiltersPlacement) {
  const [stored, setStored] = useState(() => closedSession(placement))
  const session = drawerSessionIn(stored, placement)

  if (session !== stored) {
    setStored(session)
  }

  return {
    open: session.open,
    setOpen: (open: boolean) => {
      setStored({ open, placement })
    },
  }
}

/** Opens the Filters drawer; provided by the page, which owns the session. */
export const OpenFiltersContext = createContext<() => void>(() => undefined)

/**
 * What the Filters button does where Filters are now: opens their drawer, or collapses or expands the
 * docked column.
 */
export function useToggleFilters(placement: FiltersPlacement): () => void {
  const openDrawer = use(OpenFiltersContext)

  return () => {
    if (placement === 'drawer') {
      openDrawer()
    } else {
      setFiltersCollapsed(placement === 'docked')
    }
  }
}

/** Where a Panel's frame sits: a column of the page, or inside a drawer that draws its own frame. */
export type Frame = 'docked' | 'drawer'

const FrameContext = createContext<Frame>('docked')

/** Where the Panel rendering this sits. Outside a drawer (the loading skeleton too), `docked`. */
export function usePlacement(): Frame {
  return use(FrameContext)
}

/**
 * A Panel frame's border, corners, and width for its placement. `width` is its docked width class; a
 * drawer sets its own size, and the frame fills it.
 */
export function panelFrameClass(placement: Frame, width: string): string {
  return placement === 'drawer'
    ? 'min-h-0 w-full grow'
    : cn(width, 'shrink-0 rounded-xl border border-border')
}

/**
 * The docked Filters column, which the user can slide away. Collapsing animates the column's width
 * to nothing while the panel slides off the page's edge, as the shadcn Sidebar's `offcanvas` does,
 * and the rail on its edge toggles it. A collapsed panel is inert, so it leaves the tab order.
 */
export function DockedFilters({
  children,
  collapsed,
}: {
  children: ReactNode
  collapsed: boolean
}) {
  return (
    <div
      className={cn(
        // The negative margin takes back the row's gap, so Results meets the page's padding.
        'relative flex w-68 shrink-0 transition-[width,margin] duration-200 ease-linear data-collapsed:-mr-2 data-collapsed:w-0',
        DOCKED_FILTERS_MEDIA_CLASS,
      )}
      data-collapsed={collapsed ? '' : undefined}
    >
      <div
        className="absolute inset-y-0 left-0 flex transition-[translate,visibility] duration-200 ease-linear in-data-collapsed:invisible in-data-collapsed:-translate-x-[calc(100%+--spacing(2))]"
        inert={collapsed}
      >
        {children}
      </div>
      <FiltersRail collapsed={collapsed} />
    </div>
  )
}

/** The docked column's edge: a strip that shows a rule on hover and collapses or expands Filters. */
function FiltersRail({ collapsed }: { collapsed: boolean }) {
  const label = collapsed ? 'Expand Filters' : 'Collapse Filters'

  return (
    <button
      aria-label={label}
      className={cn(
        'absolute inset-y-0 -right-3 z-20 w-4 after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 hover:after:bg-border',
        collapsed ? 'cursor-e-resize' : 'cursor-w-resize',
      )}
      onClick={() => {
        setFiltersCollapsed(!collapsed)
      }}
      // The scope bar's Filters button is the keyboard's way to the same action.
      tabIndex={-1}
      title={label}
      type="button"
    />
  )
}

/** The drawer's popup classes for each edge it comes from. */
const DRAWER_CLASS = {
  // Over the page's foot, clear of the home indicator and, in landscape, the notch, at a height that
  // leaves the scope bar in view.
  bottom:
    'h-[85dvh] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]',
  // Clear of the notch and home indicator on a phone, and the notch in landscape.
  left: 'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]',
  right: '',
} as const

const SWIPE_DIRECTION = { bottom: 'down', left: 'left', right: 'right' } as const

/** Why Base UI asks a drawer to open or close: a swipe, Esc, a tap outside, and so on. */
type DrawerChangeReason = Parameters<
  NonNullable<ComponentProps<typeof Drawer>['onOpenChange']>
>[1]['reason']

interface PanelDrawerProps {
  /** The Panel, which reads its frame through `usePlacement`. */
  children: ReactNode
  /** Moves focus when the drawer closes; see Base UI's `finalFocus`. */
  finalFocus?: ComponentProps<typeof DrawerContent>['finalFocus']
  /** The drawer's accessible title. */
  label: string
  /** Modal: traps focus, blocks the page behind a backdrop, and closes on a tap outside. */
  modal: boolean
  /** Called when the drawer asks to change, with Base UI's reason. */
  onOpenChange: (open: boolean, reason: DrawerChangeReason) => void
  open: boolean
  /** The edge the drawer comes from, and swipes back to. */
  side: keyof typeof DRAWER_CLASS
}

/**
 * A Panel in a Base UI drawer, which keeps its native motion, swipe to dismiss, and backdrop. A modal
 * drawer takes focus; a non-modal one leaves it where it is, so the page under it keeps its keys.
 *
 * The Panel stays mounted while the drawer is closed, hidden in an `<Activity>`, which React renders
 * at low priority after the page. Opening then only reveals it: mounting a Panel as heavy as Filters
 * in the frame the drawer opens took longer than the slide, which a phone skipped. It hides once the
 * closing slide has finished, so the Panel stays on screen while it leaves.
 */
export function PanelDrawer({
  children,
  finalFocus,
  label,
  modal,
  onOpenChange,
  open,
  side,
}: PanelDrawerProps) {
  const popup = useRef<HTMLDivElement>(null)
  const wasModal = useRef(modal)
  // Whether the Panel shows: from the moment the drawer opens until its closing slide ends, which
  // Base UI reports when the motion ends. Closing mid-opening still ends with that slide.
  const [revealed, setRevealed] = useState(open)

  if (open && !revealed) {
    setRevealed(true)
  }

  // A drawer that turns modal while open (a window narrowed under it) keeps its Panel, and the tab the
  // user is on, but Base UI runs its initial focus only as the drawer opens, so the focus it never
  // moved is still on the page the drawer now blocks. Take it into the popup.
  useEffect(() => {
    const turnedModal = modal && !wasModal.current

    wasModal.current = modal

    if (turnedModal && open) {
      popup.current?.focus()
    }
  }, [modal, open])

  return (
    <Drawer
      // A non-modal drawer stays open while the user works the page beside it.
      disablePointerDismissal={!modal}
      modal={modal}
      onOpenChange={(next, details) => {
        onOpenChange(next, details.reason)
      }}
      onOpenChangeComplete={(next) => {
        if (!next) {
          setRevealed(false)
        }
      }}
      open={open}
      showSwipeHandle={side === 'bottom'}
      swipeDirection={SWIPE_DIRECTION[side]}
    >
      <DrawerContent
        className={DRAWER_CLASS[side]}
        finalFocus={finalFocus}
        // A modal drawer on a touch screen focuses itself, not its first field, which would raise
        // the on-screen keyboard; the drawers open from app state, so the open has no interaction
        // type to tell a tap by. A non-modal drawer leaves focus in the page.
        initialFocus={() => modal && (!matchMedia('(pointer: coarse)').matches || popup.current)}
        keepMounted
        ref={popup}
      >
        <DrawerTitle className="sr-only">{label}</DrawerTitle>
        <Activity mode={revealed ? 'visible' : 'hidden'}>
          <FrameContext value="drawer">{children}</FrameContext>
        </Activity>
      </DrawerContent>
    </Drawer>
  )
}
