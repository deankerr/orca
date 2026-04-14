import { get, list } from './queries'
import { catalogProvidersTable } from './table'

export const providers = {
  get,
  list,
} as const

export const providersSchema = {
  table: catalogProvidersTable,
} as const
