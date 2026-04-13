import { get, list } from './queries'
import { providersTable } from './table'
export type { ProviderProjection } from './projection'

export const providers = {
  get,
  list,
} as const

export const providersSchema = {
  table: providersTable,
} as const
