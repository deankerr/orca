import { ingest, setAvailability } from './ingest'
import { history, get, list, listAvailableStatesByModel } from './queries'

export const endpoints = {
  get,
  history,
  list,
  listAvailableStatesByModel,
  ingest,
  setAvailability,
} as const
