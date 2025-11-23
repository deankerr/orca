import { Suspense } from 'react'

import {
  PageContainer,
  PageDescription,
  PageHeader,
  PageTitle,
} from '@/components/app-layout/pages'
import { ClientOnly } from '@/components/client-only'
import { EndpointsDataGrid } from '@/components/endpoints-data-grid/page'

export default function Page() {
  return (
    <PageContainer className="overflow-hidden px-0 pb-0 sm:px-0 sm:pb-0">
      <PageHeader>
        <PageTitle>Endpoints</PageTitle>
        <PageDescription>Compare models and providers available on OpenRouter</PageDescription>
      </PageHeader>

      <Suspense>
        <ClientOnly>
          <EndpointsDataGrid />
        </ClientOnly>
      </Suspense>
    </PageContainer>
  )
}
