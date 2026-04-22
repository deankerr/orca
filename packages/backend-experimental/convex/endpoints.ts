import { internalMutation, internalQuery, query } from './_generated/server'
import { endpoints } from './catalog/endpoints'

export const get = query(endpoints.get)
export const history = query(endpoints.history)
export const list = query(endpoints.list)

export const ingest = internalMutation(endpoints.ingest)
export const listAvailableStates = internalQuery(endpoints.listAvailableStates)
export const setAvailability = internalMutation(endpoints.setAvailability)
