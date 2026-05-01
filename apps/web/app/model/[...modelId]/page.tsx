import type { Metadata } from 'next'

import { ExpConvexClientProvider } from '@/app/exp-convex-client-provider'

import { ModelPage } from '../model-page'

type PageProps = {
  params: Promise<{ modelId: string[] }>
}

function getModelId(params: { modelId: string[] }) {
  return params.modelId.map((part) => decodeURIComponent(part)).join('/')
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const modelId = getModelId(await params)

  return {
    title: modelId,
  }
}

export default async function Page({ params }: PageProps) {
  const modelId = getModelId(await params)

  return (
    <ExpConvexClientProvider>
      <ModelPage modelId={modelId} />
    </ExpConvexClientProvider>
  )
}
