import type { ReactNode } from 'react'

/** The page's grid of panels. The loaded page and its loading skeleton both sit in it, so they line up. */
export function AppLayout({ busy, children }: { busy?: boolean; children: ReactNode }) {
  return (
    <main aria-busy={busy} className="flex h-svh gap-2 bg-background p-2">
      {children}
    </main>
  )
}
