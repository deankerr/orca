import type { Metadata } from 'next'
import { Suspense } from 'react'

import { ClientOnly } from '@/components/shared/client-only'
import { MonitorPage } from '@/features/monitor/monitor-page'

export const metadata: Metadata = {
  title: 'Monitor',
  description: 'Updates detected between OpenRouter API snapshots',
}

export default function Page() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <Suspense>
        <ClientOnly>
          <MonitorPage />
        </ClientOnly>
      </Suspense>
    </div>
  )
}
