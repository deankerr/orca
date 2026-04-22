import { internalMutation, internalQuery, query } from './_generated/server'
import { providers } from './catalog/providers'

export const get = query(providers.get)
export const history = query(providers.history)
export const list = query(providers.list)

// This commit boundary is an internal implementation detail of collection.
export const ingest = internalMutation(providers.ingest)
export const listAvailableStates = internalQuery(providers.listAvailableStates)
export const setAvailability = internalMutation(providers.setAvailability)
