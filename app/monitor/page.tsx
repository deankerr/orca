import { Suspense } from 'react'
import type { Metadata } from 'next'

import { MonitorPage } from '@/components/monitor/monitor-page'
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
          <MonitorPage />
        </ClientOnly>
      </Suspense>
    </div>
  )
}
