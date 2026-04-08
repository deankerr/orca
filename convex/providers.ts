import { query } from './_generated/server'
import {
  getBySlug as getProviderBySlug,
  getBySlugArgs,
  list as listProviders,
  listArgs,
} from './catalog/providers'

export const list = query({
  args: listArgs,
  handler: listProviders,
})

export const getBySlug = query({
  args: getBySlugArgs,
  handler: getProviderBySlug,
})
