import { get } from './queries'
import { endpointsTable } from './table'

export type { EndpointProjection } from './projection'

export const endpoints = {
  get,
} as const

export const endpointsSchema = {
  table: endpointsTable,
} as const
