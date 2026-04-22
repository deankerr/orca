import { ingest, setAvailability } from './ingest'
import { history, get, list, listAvailableStates } from './queries'

export const endpoints = {
  get,
  history,
  list,
  listAvailableStates,
  ingest,
  setAvailability,
} as const
