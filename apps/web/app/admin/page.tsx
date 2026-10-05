'use client'

import { api } from '@orca/backend/api'
import { useQuery } from 'convex/react'
import Link from 'next/link'

import { PageContainer, PageHeader, PageLoading, PageTitle } from '@/components/app-layout/pages'

export default function AdminPage() {
  const result = useQuery(api.admin.demo)

  if (result === undefined) {
    return <PageLoading />
  }

  return (
    <PageContainer>
      <PageHeader>
        <PageTitle>{result.message}</PageTitle>
        <p className="text-xs text-muted-foreground">
          Convex accepted your session and confirmed administrator access. This check does not read
          or change application data.
        </p>
        <p className="font-mono text-xs">{result.userId}</p>
        <Link href="/admin/resources" className="text-xs underline">
          Open resources
        </Link>
      </PageHeader>
    </PageContainer>
  )
}
