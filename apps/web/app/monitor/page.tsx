import type { Metadata } from 'next'
import { Suspense } from 'react'

import { MonitorPage } from '@/components/monitor/monitor-page'
import { ClientOnly } from '@/components/shared/client-only'

export const metadata: Metadata = {
  title: 'Monitor',
  description:
    'Every change to every OpenRouter model, endpoint, and provider — field-level diffs between snapshots, as they happen.',
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
