import { query } from './_generated/server'
import {
  getBySlug as getModelBySlug,
  getBySlugArgs,
  list as listModels,
  listArgs,
} from './catalog/models'

export const list = query({
  args: listArgs,
  handler: listModels,
})

export const getBySlug = query({
  args: getBySlugArgs,
  handler: getModelBySlug,
})
