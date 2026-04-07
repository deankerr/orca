import { query } from './_generated/server'
import { list as listEndpoints, listArgs } from './catalog/endpoints'

export const list = query({
  args: listArgs,
  handler: listEndpoints,
})
