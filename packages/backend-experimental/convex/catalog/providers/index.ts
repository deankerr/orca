import { ingest, setAvailability } from './ingest'
import { history, get, list, listAvailableStates } from './queries'
import { coreTable, stateTable } from './schema'

export const providers = {
  get,
  history,
  ingest,
  list,
  listAvailableStates,
  setAvailability,
} as const

export const providersSchema = {
  stateTable,
  coreTable,
} as const
