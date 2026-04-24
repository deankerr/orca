import { internalMutation, internalQuery, query } from './_generated/server'
import { providers } from './catalog/providers'

export const get = query(providers.get)
export const history = query(providers.history)
export const list = query(providers.list)

export const commit = internalMutation(providers.commit)
export const listStates = internalQuery(providers.listStates)
export const markUnavailable = internalMutation(providers.markUnavailable)
