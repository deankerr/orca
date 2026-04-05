'use client'

import { XCircle } from 'lucide-react'
import { posthog } from 'posthog-js'
import { useEffect } from 'react'

import { PageContainer } from '@/components/app-layout/pages'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export default function ErrorPage({ error }: { error: Error & { digest?: string } }) {
  const isDev = process.env.NODE_ENV === 'development'

  useEffect(() => {
    posthog.captureException(error)
  }, [error])

  return (
    <PageContainer className="flex flex-col items-center justify-center">
      <Alert variant="destructive" className="w-full max-w-3xl">
        <XCircle />
        <AlertTitle>Something went wrong</AlertTitle>
        <AlertDescription>
          An error occurred while rendering this page. These options may help:
          <div className="mt-2 space-x-2">
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Refresh Page
            </Button>

            <Button variant="secondary" onClick={() => (window.location.href = '/')}>
              Go Home
            </Button>
          </div>
          {error?.message && isDev && <div className="py-3 font-mono text-sm">{error.message}</div>}
          {error?.digest && <div className="py-3 font-mono text-xs">Digest: {error.digest}</div>}
        </AlertDescription>
      </Alert>
    </PageContainer>
  )
}
