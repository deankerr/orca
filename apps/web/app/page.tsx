import { Suspense } from 'react'

import { ClientOnly } from '@/components/shared/client-only'

import { EndpointsDataGridClient } from './endpoints-data-grid-client'

export default function Page() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Suspense>
        <ClientOnly>
          <EndpointsDataGridClient />
        </ClientOnly>
      </Suspense>
    </div>
  )
}
