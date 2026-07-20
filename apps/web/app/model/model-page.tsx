'use client'

import { api } from '@orca/backend/convex/_generated/api'
import { ArrowLeft, Boxes } from 'lucide-react'
import Link from 'next/link'
import { parseAsStringLiteral, useQueryState } from 'nuqs'
import { useEffect } from 'react'

import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCachedQuery } from '@/hooks/use-cached-query'

import { ModelHeader } from './model-page-header'
import { ParameterComparisonCard } from './parameter-comparison-card'
import { PricingHistoryCard } from './pricing-history-card'
import { ProviderComparisonCard } from './provider-comparison-card'
import type { Model } from './types'
import { useModelEndpoints } from './use-model-endpoints'

const MODEL_PAGE_TABS = ['provider-comparison', 'pricing-history', 'parameter-comparison'] as const

type ModelPageTab = (typeof MODEL_PAGE_TABS)[number]

// The tab lives in the URL so sections are directly linkable, and it renders
// correctly on the server - there is no "no tab selected yet" frame.
const tabParser = parseAsStringLiteral(MODEL_PAGE_TABS).withDefault('provider-comparison')

export function ModelPage({ model }: { model: Model }) {
  const [activeTab, setActiveTab] = useQueryState('tab', tabParser)

  // Warm every tab's Convex subscription while the user reads the first one,
  // so switching tabs swaps in data that is already cached.
  useModelEndpoints(model.slug)
  useCachedQuery(api.endpointPricingHistory.get, { modelSlug: model.slug })

  useEffect(() => {
    // Prefetch the ECharts chunk for the same reason.
    void import('./pricing-history-plot')
  }, [])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 [scrollbar-gutter:stable] flex-col overflow-y-auto overscroll-contain px-2">
      <ModelHeader model={model} />

      <Tabs
        className="gap-0"
        onValueChange={(value) => {
          if (isModelPageTab(value)) {
            void setActiveTab(value)
          }
        }}
        value={activeTab}
      >
        <div className="border-b">
          <div className="mx-auto w-full max-w-6xl px-3">
            <TabsList variant="line" className="max-w-full overflow-x-auto">
              <TabsTrigger value="provider-comparison">Providers</TabsTrigger>
              <TabsTrigger value="pricing-history">Pricing history</TabsTrigger>
              <TabsTrigger value="parameter-comparison">Parameters</TabsTrigger>
            </TabsList>
          </div>
        </div>

        <TabsContent
          value="provider-comparison"
          className="mx-auto w-full max-w-6xl px-3 py-4 text-sm/normal"
        >
          <ProviderComparisonCard modelSlug={model.slug} />
        </TabsContent>
        <TabsContent
          value="pricing-history"
          className="mx-auto w-full max-w-6xl px-3 py-4 text-sm/normal"
        >
          <PricingHistoryCard modelSlug={model.slug} />
        </TabsContent>
        <TabsContent
          value="parameter-comparison"
          className="mx-auto w-full max-w-6xl px-3 py-4 text-sm/normal"
        >
          <ParameterComparisonCard modelSlug={model.slug} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function isModelPageTab(value: unknown): value is ModelPageTab {
  return typeof value === 'string' && MODEL_PAGE_TABS.some((tab) => tab === value)
}

export function ModelNotFound({ modelId }: { modelId: string }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-y-auto overscroll-contain p-6">
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
    </div>
  )
}
