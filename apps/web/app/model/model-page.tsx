'use client'

import { api } from '@orca/backend/convex/_generated/api'
import { useQuery } from 'convex/react'
import { ArrowLeft, Boxes } from 'lucide-react'
import ms from 'ms'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'

import { ModelHeader } from './model-page-header'
import { ParameterComparisonCard } from './parameter-comparison-card'
import { PricingHistoryCard } from './pricing-history-card'
import { ProviderComparisonCard } from './provider-comparison-card'

const UNAVAILABLE_WINDOW_MS = ms('30d')

export function ModelPage({ modelId }: { modelId: string }) {
  const model = useQuery(api.models.getBySlug, {
    slug: modelId,
  })
  const endpoints = useQuery(api.endpoints.listForModel, {
    modelSlug: modelId,
    maxTimeUnavailable: UNAVAILABLE_WINDOW_MS,
  })

  if (model === undefined) {
    return (
      <div className="mx-auto w-full max-w-6xl px-3 py-5">
        <LoadingBadge label="Loading model" />
      </div>
    )
  }

  if (model === null) {
    return <NotFoundState modelId={modelId} />
  }

  return (
    <main className="flex flex-1 flex-col overflow-y-auto">
      <ModelHeader model={model} />

      <div className="mx-auto grid w-full max-w-6xl gap-4 px-3 py-4">
        {endpoints === undefined ? (
          <LoadingBadge label="Loading endpoints" />
        ) : (
          <>
            <ProviderComparisonCard endpoints={endpoints} />
            <PricingHistoryCard modelSlug={modelId} />
            <ParameterComparisonCard endpoints={endpoints} />
          </>
        )}
      </div>
    </main>
  )
}

function LoadingBadge({ label }: { label: string }) {
  return (
    <Badge variant="outline" className="rounded-sm">
      <Spinner data-icon="inline-start" />
      {label}
    </Badge>
  )
}

function NotFoundState({ modelId }: { modelId: string }) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Empty className="max-w-lg border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Boxes />
          </EmptyMedia>
          <EmptyTitle>Model not found</EmptyTitle>
          <EmptyDescription>
            No current catalog model matched <code className="font-mono">{modelId}</code>.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button nativeButton={false} variant="outline" render={<Link href="/" />}>
            <ArrowLeft data-icon="inline-start" />
            Back to endpoints
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  )
}
