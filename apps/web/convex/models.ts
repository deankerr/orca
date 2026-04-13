import { query } from './_generated/server'
import { models } from './catalog/models'

export const list = query(models.list)

export const getBySlug = query(models.get)
