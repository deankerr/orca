import { get, list, listForModel } from './queries'
import { endpointsTable } from './table'
export type { EndpointProjection } from './projection'

export const endpoints = {
  get,
  list,
  listForModel,
} as const

export const endpointsSchema = {
  table: endpointsTable,
} as const
