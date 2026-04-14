import { get, list } from './queries'
import { catalogEndpointPricingTable, catalogEndpointsTable } from './table'

export const endpoints = {
  get,
  list,
} as const

export const endpointsSchema = {
  table: catalogEndpointsTable,
  pricingTable: catalogEndpointPricingTable,
} as const
