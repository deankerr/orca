import type { ReactNode } from 'react'

import { OrbMark } from './orb-mark'

/**
 * The brand, over the Filters panel, with room after it for the panel's own controls. The mark's tile
 * fills its box, so the side inset (a facet's, `px-3`) puts the tile's edge on the facets' left edge
 * with the checkboxes and filter fields. The height is the Results scope bar's (its Filters button
 * plus the header inset twice), so the two share a centre line when Filters are docked.
 */
export function HeaderBar({ children }: { children?: ReactNode }) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-2.5 px-3 pointer-coarse:h-12">
      <OrbMark />
      <span className="font-sans text-[15px] leading-5 font-[650] tracking-[0.06em]">ORCA</span>
      {children}
    </header>
  )
}
