import { OrbMark } from './orb-mark'

export function HeaderBar() {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 px-4">
      <OrbMark />
      <span className="font-mono text-[13px] leading-4 font-semibold tracking-[0.14em]">ORCA</span>
    </header>
  )
}
