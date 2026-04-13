import { query } from './_generated/server'
import { endpoints } from './catalog/endpoints'

export const list = query(endpoints.list)

export const getByUuid = query(endpoints.get)
