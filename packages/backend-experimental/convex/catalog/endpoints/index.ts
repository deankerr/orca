import { ingest, setAvailability } from './ingest'
import { history, get, list, listStatesByModel } from './queries'
import { coreTable, pricingTable, stateTable } from './table'

export const endpoints = {
  get,
  history,
  list,
  listStatesByModel,
  ingest,
  setAvailability,
} as const

export const endpointsSchema = {
  stateTable,
  coreTable,
  pricingTable,
} as const
