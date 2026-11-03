import { AppPageSwitch } from '#components/app-page-switch'
import { OrbMark } from '#components/orb-mark'

export function HeaderBar() {
  return (
    <header className="flex shrink-0 items-center justify-between pt-3.5 pr-3.5 pb-2.5 pl-4">
      <div className="flex items-center gap-2">
        <OrbMark />
        <span className="font-mono text-[13px] leading-4 font-semibold tracking-[0.14em]">
          ORCA
        </span>
      </div>
      <AppPageSwitch />
    </header>
  )
}
