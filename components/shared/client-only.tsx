'use client'

import { useSyncExternalStore, type ReactNode } from 'react'

// Returns false on the server, true on the client — no hydration mismatch.
// subscribe is a no-op because there's no external store to listen to;
// we just need the server/client snapshot distinction.
export function ClientOnly({ children }: { children: ReactNode }) {
  const hasMounted = useSyncExternalStore(
    () => () => {},
    () => true, // client snapshot
    () => false, // server snapshot
  )
  if (!hasMounted) return null

  return children
}
