import { ingest, setAvailability } from './ingest'
import { history, get, list, listAvailableStatesByModel } from './queries'
import { coreTable, pricingTable, stateTable } from './schema'

export const endpoints = {
  get,
  history,
  list,
  listAvailableStatesByModel,
  ingest,
  setAvailability,
} as const

export const endpointsSchema = {
  stateTable,
  coreTable,
  pricingTable,
} as const
