import { get, list } from './queries'
import { endpointsTable } from './table'
export type { EndpointProjection } from './projection'

export const endpoints = {
  get,
  list,
} as const

export const endpointsSchema = {
  table: endpointsTable,
} as const
