import type { ReactNode } from 'react'

/**
 * The page's row of Panels. The loaded page and its loading skeleton both sit in it, so they line up.
 * The page fills the dynamic viewport and pads itself clear of notches and the home indicator; the
 * inner row is what an overlaid Panel positions against (see `PanelSlot`).
 */
export function AppLayout({ busy, children }: { busy?: boolean; children: ReactNode }) {
  return (
    <main
      aria-busy={busy}
      className="flex h-dvh overflow-hidden bg-background pt-[max(0.5rem,env(safe-area-inset-top))] pr-[max(0.5rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))]"
    >
      <div className="relative flex min-w-0 grow gap-2">{children}</div>
    </main>
  )
}
