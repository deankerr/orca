import { convexQuery } from '@convex-dev/react-query'
import { api } from '@orca/backend/api'

export const modelOverviewQuery = (slug: string) =>
  convexQuery(api.catalog.models.query.get, { model_id: slug })

export const providerOverviewQuery = (slug: string) =>
  convexQuery(api.catalog.providers.query.get, { provider_id: slug })
