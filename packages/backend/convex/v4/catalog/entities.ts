import { z } from 'zod'

import { Pricing } from '../pricing'
import { Endpoint, Model, Provider } from '../scan'

/** Facts required by the Catalog model projection. */
export const CatalogModel = Model.extend({ short_name: z.string(), created_at: z.string() })

/** Facts required by the Catalog provider projection. */
export const CatalogProvider = Provider.extend({ displayName: z.string() })

/** Facts required by the Catalog endpoint projection. */
export const CatalogEndpoint = Endpoint.extend({
  provider_display_name: z.string(),
  pricing: Pricing,
})
