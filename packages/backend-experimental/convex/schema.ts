import { defineSchema } from 'convex/server'

import { catalogEndpointsTable, catalogEndpointPricingTable } from './catalog/endpoints/table'
import { catalogModelsTable } from './catalog/models/table'
import { catalogProvidersTable } from './catalog/providers/table'
import { catalogRegistryTable } from './catalog/registry/table'

export default defineSchema(
  {
    catalog_registry: catalogRegistryTable,
    catalog_endpoints_base: catalogEndpointsTable,
    catalog_endpoint_pricing: catalogEndpointPricingTable,
    catalog_models_base: catalogModelsTable,
    catalog_providers_base: catalogProvidersTable,
  },
  {
    strictTableNameTypes: true,
    schemaValidation: false, // wipe dev data frequently
  },
)
