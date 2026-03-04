import { Suspense } from 'react'
import type { Metadata } from 'next'

import { MonitorFeed } from '@/components/monitor-feed/monitor-feed-page'
import { ClientOnly } from '@/components/shared/client-only'

export const metadata: Metadata = {
  title: 'Monitor',
  description: 'Updates detected between OpenRouter API snapshots',
}

export default function Page() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Suspense>
        <ClientOnly>
          <MonitorFeed />
        </ClientOnly>
      </Suspense>
    </div>
  )
}
