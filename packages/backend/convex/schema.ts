import { defineSchema } from 'convex/server'

// Always use direct imports for Convex tables in this file
import { OBJECTS_LOCATORS_TABLE, locatorsTable } from './objects/table'
import { publicApiV2CacheTable } from './public_api/v2/table'
import { V4_CURRENT_ENDPOINTS_TABLE, currentEndpointsTable } from './v4/catalog/endpoints/table'
import { V4_CURRENT_MODELS_TABLE, currentModelsTable } from './v4/catalog/models/table'
import { V4_CURRENT_PROVIDERS_TABLE, currentProvidersTable } from './v4/catalog/providers/table'
import { V4_EVENTS_TABLE, eventsTable } from './v4/events/table'
import { V4_ENDPOINT_LISTINGS_TABLE, endpointListingsTable } from './v4/history/listings/table'
import { V4_ENDPOINT_PRICES_TABLE, endpointPricesTable } from './v4/history/pricing/table'
import { V4_ENDPOINT_STATS_TABLE, endpointStatsTable } from './v4/history/stats/table'
import {
  V4_INGESTIONS_TABLE,
  V4_PROCESSOR_WORK_TABLE,
  ingestionsTable,
  processorWorkTable,
} from './v4/ingestion/table'
import { V4_CURRENT_STATS_TABLE, currentStatsTable } from './v4/stats/table'

export default defineSchema(
  {
    [OBJECTS_LOCATORS_TABLE]: locatorsTable,

    public_api_v2_cache: publicApiV2CacheTable,

    [V4_INGESTIONS_TABLE]: ingestionsTable,
    [V4_PROCESSOR_WORK_TABLE]: processorWorkTable,
    [V4_EVENTS_TABLE]: eventsTable,
    [V4_CURRENT_STATS_TABLE]: currentStatsTable,
    [V4_ENDPOINT_PRICES_TABLE]: endpointPricesTable,
    [V4_ENDPOINT_LISTINGS_TABLE]: endpointListingsTable,
    [V4_ENDPOINT_STATS_TABLE]: endpointStatsTable,
    [V4_CURRENT_MODELS_TABLE]: currentModelsTable,
    [V4_CURRENT_PROVIDERS_TABLE]: currentProvidersTable,
    [V4_CURRENT_ENDPOINTS_TABLE]: currentEndpointsTable,
  },
  {
    strictTableNameTypes: true,
  },
)
