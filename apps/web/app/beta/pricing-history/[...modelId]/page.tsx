import { api } from '@orca/backend/convex/_generated/api'
import { fetchQuery } from 'convex/nextjs'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache, Suspense } from 'react'

import { PricingHistoryCard } from '@/components/pricing-history/card'

type PageProps = {
  params: Promise<{ modelId: string[] }>
}

function getModelId(params: { modelId: string[] }) {
  return params.modelId.map((part) => decodeURIComponent(part)).join('/')
}

// Metadata and the page body both need the model. cache() dedupes the Convex
// round trip within a single request.
const getModel = cache(async (slug: string) => await fetchQuery(api.models.getBySlug, { slug }))

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const modelId = getModelId(await params)
  const model = await getModel(modelId)
  const modelName = model?.name ?? modelId

  return {
    title: `${modelName} Pricing History`,
    description: `How provider pricing for ${modelName} has moved over time on OpenRouter.`,
    // openGraph replaces (not merges with) the root layout's, so restate siteName.
    openGraph: {
      siteName: 'ORCA',
      type: 'website',
      images: [
        {
          url: `/og/pricing-history/${modelId}`,
          width: 1200,
          height: 630,
          alt: `${modelName} pricing history on ORCA`,
        },
      ],
    },
  }
}

export default async function Page({ params }: PageProps) {
  const modelId = getModelId(await params)
  const model = await getModel(modelId)

  if (model === null) {
    return notFound()
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 [scrollbar-gutter:stable] flex-col overflow-y-auto overscroll-contain sm:p-4">
      <div className="mx-auto w-full max-w-6xl">
        <Suspense>
          <PricingHistoryCard modelName={model.name} modelSlug={model.slug} />
        </Suspense>
      </div>
    </div>
  )
}
