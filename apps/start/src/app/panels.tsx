import { Sheet, SheetContent, SheetTitle } from '@orca/ui/components/sheet'
import { useSelector } from '@tanstack/react-store'
import { createAtom } from '@tanstack/store'
import { cn } from 'cn'
import { createContext, use, useRef, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'

import { useSelectedEndpoint } from '#endpoints/hooks'

import { BREAKPOINTS, breakpointFloor, panelLayout } from './panel-layout'
import type { PanelLayout, Placement } from './panel-layout'

/*
 * The panel layout primitive. `usePanelLayout` reads where each Panel goes from the page's width and
 * the selection, `PanelSlot` puts a Panel there, and a Panel's frame reads its own placement with
 * `usePlacement` to drop the border and width a sheet already provides. The same Panel components
 * render in every layout; nothing about the layout is stored, so resizing the window or changing the
 * selection can never leave it out of date.
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
 * Where each secondary Panel goes at the page's current width, given whether an endpoint is selected.
 * Re-renders only when a breakpoint is crossed or the selection comes or goes.
 */
export function usePanelLayout(): PanelLayout {
  const width = useSyncExternalStore(subscribe, clientWidth, serverWidth)

  return panelLayout(width, useSelectedEndpoint() !== null)
}

/**
 * Whether the user has opened the Filters sheet. It only matters while the layout puts Filters in a
 * sheet, so readers combine it with the layout instead of anything resetting it.
 */
const filtersSheetOpen = createAtom(false)

export function setFiltersSheetOpen(open: boolean) {
  filtersSheetOpen.set(open)
}

export function useFiltersSheetOpen(): boolean {
  return useSelector(filtersSheetOpen)
}

const PlacementContext = createContext<Placement>('docked')

/** Where the Panel rendering this sits. Outside a `PanelSlot` (the loading skeleton), `docked`. */
export function usePlacement(): Placement {
  return use(PlacementContext)
}

/**
 * A Panel frame's border, corners, and width for its placement. `width` is its docked width class; a
 * sheet sets its own size, and the frame fills it.
 */
export function panelFrameClass(placement: Placement, width: string): string {
  return placement === 'sheet'
    ? 'min-h-0 w-full grow'
    : cn(width, 'shrink-0 rounded-xl border border-border', placement === 'overlay' && 'shadow-2xl')
}

const SHEET_CLASS = {
  // From the bottom, leaving the page's top in view so the sheet reads as above the table.
  bottom:
    'gap-0 rounded-t-xl data-[side=bottom]:h-[85dvh] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]',
  // A Panel's docked width, or the page less a strip of backdrop to tap.
  left: 'w-[min(20rem,calc(100vw-3rem))] gap-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] data-[side=left]:sm:max-w-none',
} as const

interface PanelSlotProps {
  /** The Panel, which reads its placement through `usePlacement`. */
  children: ReactNode
  /** The sheet's accessible title. */
  label: string
  /** Called when a sheet asks to close: Esc or a tap on the backdrop. */
  onClose: () => void
  /** Whether a sheet is open; docked and overlaid Panels show whenever they render. */
  open: boolean
  placement: Placement
  /** The edge a sheet comes from. */
  side: keyof typeof SHEET_CLASS
}

/**
 * Puts a Panel where the layout says. Docked, it is a column of the page's row; overlaid, it floats
 * over Results' trailing edge; in a sheet, it is a modal dialog with its own focus trap.
 */
export function PanelSlot({ children, label, onClose, open, placement, side }: PanelSlotProps) {
  const popup = useRef<HTMLDivElement>(null)
  const panel = <PlacementContext value={placement}>{children}</PlacementContext>

  if (placement === 'docked') {
    return panel
  }

  if (placement === 'overlay') {
    return <div className="absolute inset-y-0 right-0 z-20 flex max-w-full">{panel}</div>
  }

  return (
    <Sheet
      onOpenChange={(next) => {
        if (!next) {
          onClose()
        }
      }}
      open={open}
    >
      <SheetContent
        className={SHEET_CLASS[side]}
        // On a touch screen the sheet itself takes focus: focusing its first field would raise the
        // on-screen keyboard. The sheets open from app state, not a trigger, so the open carries no
        // interaction type to tell a tap by.
        initialFocus={() => (matchMedia('(pointer: coarse)').matches ? popup.current : true)}
        ref={popup}
        showCloseButton={false}
        side={side}
      >
        <SheetTitle className="sr-only">{label}</SheetTitle>
        {panel}
      </SheetContent>
    </Sheet>
  )
}
