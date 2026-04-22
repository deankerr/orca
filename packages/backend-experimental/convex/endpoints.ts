import { internalMutation, internalQuery, query } from './_generated/server'
import { endpoints } from './catalog/endpoints'

export const get = query(endpoints.get)
export const history = query(endpoints.history)
export const list = query(endpoints.list)

// These commit boundaries are internal implementation details of collection.
export const ingest = internalMutation(endpoints.ingest)
export const listAvailableStatesByModel = internalQuery(endpoints.listAvailableStatesByModel)
export const setAvailability = internalMutation(endpoints.setAvailability)
