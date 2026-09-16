import { Suspense } from 'react'

import { PageLoading } from '@/components/app-layout/pages'

import { RawChanges } from './raw-changes'

export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <RawChanges />
    </Suspense>
  )
}
