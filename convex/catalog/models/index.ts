import { get, getDescription, list } from './queries'
import { modelDescriptionsTable, modelsTable } from './table'
export type { ModelProjection } from './projection'

export const models = {
  get,
  list,
  descriptions: {
    get: getDescription,
  },
} as const

export const modelsSchema = {
  table: modelsTable,
  descriptions: {
    table: modelDescriptionsTable,
  },
} as const
