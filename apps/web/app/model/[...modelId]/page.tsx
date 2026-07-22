import { api } from '@orca/backend/convex/_generated/api'
import { fetchQuery } from 'convex/nextjs'
import type { Metadata } from 'next'
import { cache } from 'react'

import { ModelNotFound, ModelPage } from '../model-page'

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

  return {
    title: model?.name ?? modelId,
  }
}

export default async function Page({ params }: PageProps) {
  const modelId = getModelId(await params)
  const model = await getModel(modelId)

  if (model === null) {
    return <ModelNotFound modelId={modelId} />
  }

  // Server-rendering the header with its data is the CLS fix: the model
  // arrives in the initial HTML instead of behind a client subscription.
  return <ModelPage model={model} />
}
