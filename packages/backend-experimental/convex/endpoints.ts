import { query } from './_generated/server'
import { endpoints } from './catalog/endpoints'

export const get = query(endpoints.get)
export const list = query(endpoints.list)
