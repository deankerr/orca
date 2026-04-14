import { query } from './_generated/server'
import { providers } from './catalog/providers'

export const get = query(providers.get)
export const list = query(providers.list)
