import { permanentRedirect } from 'next/navigation'

import { buildLegacyPricingHistoryHref } from '@/features/pricing-history/query-state'

type PageProps = {
  params: Promise<{ modelId: string[] }>
}

export default async function Page({ params }: PageProps) {
  const { modelId } = await params
  permanentRedirect(buildLegacyPricingHistoryHref(modelId))
}
