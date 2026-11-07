import type { ReactNode } from 'react'

import { OrbMark } from './orb-mark'

/** The brand, over the Filters panel, with room after it for the panel's own controls. */
export function HeaderBar({ children }: { children?: ReactNode }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2.5 px-4">
      <OrbMark />
      <span className="font-sans text-[15px] leading-5 font-[650] tracking-[0.06em]">ORCA</span>
      {children}
    </header>
  )
}
