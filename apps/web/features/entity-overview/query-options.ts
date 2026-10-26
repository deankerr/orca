import { api } from '@orca/backend/api'

import { convexQueryOptions } from '@/lib/convex-query'

export const modelOverviewQuery = (slug: string) =>
  convexQueryOptions(api.products.entity_overview.models.get, { model_id: slug })

export const providerOverviewQuery = (slug: string) =>
  convexQueryOptions(api.products.entity_overview.providers.get, { provider_id: slug })
