import { OrbMark } from './orb-mark'

export function HeaderBar() {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2.5 px-4">
      <OrbMark />
      <span className="font-sans text-[15px] leading-5 font-[650] tracking-[0.06em]">ORCA</span>
    </header>
  )
}
