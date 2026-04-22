import { defineSchema } from 'convex/server'

import {
  coreTable as catalogEndpointCoreTable,
  pricingTable as catalogEndpointPricingTable,
  stateTable as catalogEndpointsTable,
} from './catalog/endpoints/schema'
import {
  coreTable as catalogModelCoreTable,
  descriptionTable as catalogModelDescriptionsTable,
  stateTable as catalogModelsTable,
} from './catalog/models/schema'
import {
  coreTable as catalogProviderCoreTable,
  stateTable as catalogProvidersTable,
} from './catalog/providers/schema'

export default defineSchema(
  {
    catalog_endpoints: catalogEndpointsTable,
    catalog_endpoint_core: catalogEndpointCoreTable,
    catalog_endpoint_pricing: catalogEndpointPricingTable,
    catalog_models: catalogModelsTable,
    catalog_model_core: catalogModelCoreTable,
    catalog_model_descriptions: catalogModelDescriptionsTable,
    catalog_providers: catalogProvidersTable,
    catalog_provider_core: catalogProviderCoreTable,
  },
  {
    strictTableNameTypes: true,
    schemaValidation: false, // wipe dev data frequently
  },
)
