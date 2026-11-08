import { cn } from 'cn'
import type { ReactNode } from 'react'

import { FLUSH_PAGE_MEDIA_CLASS } from './panel-layout'

/**
 * The page's row of Panels. The loaded page and its loading skeleton both sit in it, so they line up.
 * The page fills the dynamic viewport and pads itself clear of notches and the home indicator, except
 * where Results is the only docked Panel: there it runs flush to the screen's top and bottom edges and
 * pads its own bars (see `FLUSH_PAGE_MEDIA_CLASS`).
 */
export function AppLayout({ busy, children }: { busy?: boolean; children: ReactNode }) {
  return (
    <main
      aria-busy={busy}
      className={cn(
        'flex h-dvh overflow-hidden bg-background pt-[max(0.5rem,env(safe-area-inset-top))] pr-[max(0.5rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))]',
        FLUSH_PAGE_MEDIA_CLASS,
      )}
    >
      <div className="flex min-w-0 grow gap-2">{children}</div>
    </main>
  )
}
