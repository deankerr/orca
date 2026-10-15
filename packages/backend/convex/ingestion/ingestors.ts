import * as currentEndpoints from './catalog/currentEndpoints'
import * as currentModels from './catalog/currentModels'
import * as currentProviders from './catalog/currentProviders'
import * as currentStats from './catalog/currentStats'
import * as events from './catalog/events'
import * as observations from './catalog/observations'
import * as pricingHistory from './catalog/pricingHistory'
import * as statsHistory from './catalog/statsHistory'
import type { Ingestor } from './ingestor'

export const ingestors: readonly Ingestor[] = [
  currentModels.ingest,
  currentProviders.ingest,
  currentEndpoints.ingest,
  currentStats.ingest,
  observations.ingest,
  pricingHistory.ingest,
  statsHistory.ingest,
  events.ingest,
]
