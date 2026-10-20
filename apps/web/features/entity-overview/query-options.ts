import { convexQuery } from '@convex-dev/react-query'
import { api } from '@orca/backend/api'

export const modelOverviewQuery = (slug: string) =>
  convexQuery(api.products.entity_overview.models.get, { model_id: slug })

export const providerOverviewQuery = (slug: string) =>
  convexQuery(api.products.entity_overview.providers.get, { provider_id: slug })
