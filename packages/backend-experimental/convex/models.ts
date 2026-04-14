import { query } from './_generated/server'
import { models } from './catalog/models'

export const get = query(models.get)
export const list = query(models.list)
