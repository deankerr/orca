import { query } from './_generated/server'
import { providers } from './catalog/providers'

export const list = query(providers.list)

export const getBySlug = query(providers.get)
