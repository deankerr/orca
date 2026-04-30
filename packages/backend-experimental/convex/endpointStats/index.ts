import { insertSample } from './commit'
import { get, listForModel } from './queries'

export const endpointStatsApi = {
  get,
  insertSample,
  listForModel,
} as const
