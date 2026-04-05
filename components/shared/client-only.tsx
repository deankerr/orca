'use client'

import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'

const unsubscribe = () => null
const subscribe = () => unsubscribe

// Returns false on the server, true on the client — no hydration mismatch.
// subscribe is a no-op because there's no external store to listen to;
// we just need the server/client snapshot distinction.
export function ClientOnly({ children }: { children: ReactNode }) {
  const hasMounted = useSyncExternalStore(
    subscribe,
    () => true, // client snapshot
    () => false, // server snapshot
  )
  if (!hasMounted) {
    return null
  }

  return <>{children}</>
}
