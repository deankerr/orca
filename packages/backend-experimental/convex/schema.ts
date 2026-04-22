import { defineSchema } from 'convex/server'

import * as catalogEndpoints from './catalog/endpoints/schema'
import * as catalogModels from './catalog/models/schema'
import * as catalogProviders from './catalog/providers/schema'

export default defineSchema(
  {
    catalog_endpoints: catalogEndpoints.stateTable,
    catalog_endpoint_core: catalogEndpoints.coreTable,
    catalog_endpoint_pricing: catalogEndpoints.pricingTable,
    catalog_models: catalogModels.stateTable,
    catalog_model_core: catalogModels.coreTable,
    catalog_model_descriptions: catalogModels.descriptionTable,
    catalog_providers: catalogProviders.stateTable,
    catalog_provider_core: catalogProviders.coreTable,
  },
  {
    strictTableNameTypes: true,
    schemaValidation: true,
  },
)
