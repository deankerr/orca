import { Suspense } from 'react'

import { ClientOnly } from '@/components/client-only'
import { EndpointsDataGrid } from '@/components/endpoints-data-grid/page'

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
