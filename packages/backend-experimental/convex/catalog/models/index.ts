import { get, list } from './queries'
import { catalogModelsTable } from './table'

export const models = {
  get,
  list,
} as const

export const modelsSchema = {
  table: catalogModelsTable,
} as const
