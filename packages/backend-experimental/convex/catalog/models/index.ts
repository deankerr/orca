import { ingest, setAvailability } from './ingest'
import { history, get, list, listAvailableStates } from './queries'
import { coreTable, descriptionTable, stateTable } from './schema'

export const models = {
  get,
  history,
  ingest,
  list,
  listAvailableStates,
  setAvailability,
} as const

export const modelsSchema = {
  stateTable,
  coreTable,
  descriptionTable,
} as const
