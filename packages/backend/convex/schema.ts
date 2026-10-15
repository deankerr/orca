import { defineSchema } from 'convex/server'

import {
  CURRENT_MODELS_TABLE,
  CURRENT_PROVIDERS_TABLE,
  CURRENT_ENDPOINTS_TABLE,
  CURRENT_STATS_TABLE,
  currentModelsTable,
  currentProvidersTable,
  currentEndpointsTable,
  currentStatsTable,
} from './catalog/tables/current'
import { EVENTS_TABLE, eventsTable } from './catalog/tables/events'
import { OBSERVATIONS_TABLE, observationsTable } from './catalog/tables/observations'
import { ENDPOINT_PRICES_TABLE, endpointPricesTable } from './catalog/tables/pricing'
import { ENDPOINT_STATS_TABLE, endpointStatsTable } from './catalog/tables/stats'
import {
  PROCESS_COMMITS_TABLE,
  processCommitsTable,
  SCAN_PAIRS_TABLE,
  scanPairsTable,
  SCAN_REGISTRATIONS_TABLE,
  scanRegistrationsTable,
  INGESTION_TARGET_TABLE,
  ingestionTargetTable,
} from './ingestion/tables'
// Always use direct imports for Convex tables in this file
import { OBJECTS_LOCATORS_TABLE, locatorsTable } from './objects/table'
import { PUBLIC_API_V2_CACHE_TABLE, publicApiV2CacheTable } from './public_api/v2/table'

export default defineSchema(
  {
    [OBJECTS_LOCATORS_TABLE]: locatorsTable,

    [PUBLIC_API_V2_CACHE_TABLE]: publicApiV2CacheTable,

    [CURRENT_MODELS_TABLE]: currentModelsTable,
    [CURRENT_PROVIDERS_TABLE]: currentProvidersTable,
    [CURRENT_ENDPOINTS_TABLE]: currentEndpointsTable,
    [CURRENT_STATS_TABLE]: currentStatsTable,
    [OBSERVATIONS_TABLE]: observationsTable,
    [ENDPOINT_PRICES_TABLE]: endpointPricesTable,
    [ENDPOINT_STATS_TABLE]: endpointStatsTable,
    [EVENTS_TABLE]: eventsTable,

    [SCAN_REGISTRATIONS_TABLE]: scanRegistrationsTable,
    [PROCESS_COMMITS_TABLE]: processCommitsTable,
    [SCAN_PAIRS_TABLE]: scanPairsTable,
    [INGESTION_TARGET_TABLE]: ingestionTargetTable,
  },
  {
    strictTableNameTypes: true,
  },
)
