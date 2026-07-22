import type { Metadata } from 'next'
import { Suspense } from 'react'

import { EndpointsDataGridPage } from '@/components/endpoints-data-grid/endpoints-data-grid-page'
import { ClientOnly } from '@/components/shared/client-only'

export const metadata: Metadata = {
  description:
    'Filter and compare every OpenRouter endpoint — pricing, context, modalities, features, and supported parameters in one dense grid.',
}

export default function Page() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <Suspense>
        <ClientOnly>
          <EndpointsDataGridPage />
        </ClientOnly>
      </Suspense>
    </div>
  )
}
