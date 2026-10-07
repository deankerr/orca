import { defineSchema } from 'convex/server'

import {
  DISCORD_ROUTES_TABLE,
  DISCORD_PREPARATIONS_TABLE,
  discordRoutesTable,
  discordPreparationsTable,
} from './alerts/discord/table'
import { CURRENT_ENDPOINTS_TABLE, currentEndpointsTable } from './catalog/endpoints/table'
import { CURRENT_MODELS_TABLE, currentModelsTable } from './catalog/models/table'
import { CURRENT_PROVIDERS_TABLE, currentProvidersTable } from './catalog/providers/table'
import { CURRENT_STATS_TABLE, currentStatsTable } from './catalog/stats/table'
import { EVENTS_TABLE, eventsTable } from './events/table'
import { ENDPOINT_LISTINGS_TABLE, endpointListingsTable } from './history/listings/table'
import { ENDPOINT_PRICES_TABLE, endpointPricesTable } from './history/pricing/table'
import { ENDPOINT_STATS_TABLE, endpointStatsTable } from './history/stats/table'
import {
  INGESTIONS_TABLE,
  PROCESSOR_WORK_TABLE,
  ingestionsTable,
  processorWorkTable,
} from './ingestion/table'
// Always use direct imports for Convex tables in this file
import { OBJECTS_LOCATORS_TABLE, locatorsTable } from './objects/table'
import { PUBLIC_API_V2_CACHE_TABLE, publicApiV2CacheTable } from './public_api/v2/table'

export default defineSchema(
  {
    [DISCORD_ROUTES_TABLE]: discordRoutesTable,
    [DISCORD_PREPARATIONS_TABLE]: discordPreparationsTable,
    [OBJECTS_LOCATORS_TABLE]: locatorsTable,

    [PUBLIC_API_V2_CACHE_TABLE]: publicApiV2CacheTable,

    [INGESTIONS_TABLE]: ingestionsTable,
    [PROCESSOR_WORK_TABLE]: processorWorkTable,
    [EVENTS_TABLE]: eventsTable,
    [CURRENT_STATS_TABLE]: currentStatsTable,
    [ENDPOINT_PRICES_TABLE]: endpointPricesTable,
    [ENDPOINT_LISTINGS_TABLE]: endpointListingsTable,
    [ENDPOINT_STATS_TABLE]: endpointStatsTable,
    [CURRENT_MODELS_TABLE]: currentModelsTable,
    [CURRENT_PROVIDERS_TABLE]: currentProvidersTable,
    [CURRENT_ENDPOINTS_TABLE]: currentEndpointsTable,
  },
  {
    strictTableNameTypes: true,
  },
)
