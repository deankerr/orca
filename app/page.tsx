import { Suspense } from 'react'

import { EndpointsDataGrid } from '@/components/endpoints-data-grid/page'
import { ClientOnly } from '@/components/shared/client-only'

export default function Page() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Suspense>
        <ClientOnly>
          <EndpointsDataGrid />
        </ClientOnly>
      </Suspense>
    </div>
  )
}
