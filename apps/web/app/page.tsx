import { Suspense } from 'react'

import { EndpointsDataGridPage } from '@/components/endpoints-data-grid/endpoints-data-grid-page'
import { ClientOnly } from '@/components/shared/client-only'

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
