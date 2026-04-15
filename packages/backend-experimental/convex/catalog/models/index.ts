import { get, list } from './queries'
import { catalogModelDescriptionsTable, catalogModelsTable } from './table'

export const models = {
  get,
  list,
} as const

export const modelsSchema = {
  table: catalogModelsTable,
  descriptionTable: catalogModelDescriptionsTable,
} as const
