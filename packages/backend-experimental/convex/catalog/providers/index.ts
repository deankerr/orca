import { ingest, setAvailability } from './ingest'
import { history, get, list, listAvailableStates } from './queries'

export const providers = {
  get,
  history,
  ingest,
  list,
  listAvailableStates,
  setAvailability,
} as const
