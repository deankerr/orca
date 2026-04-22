import { internalMutation, internalQuery, query } from './_generated/server'
import { models } from './catalog/models'

export const get = query(models.get)
export const history = query(models.history)
export const list = query(models.list)

export const ingest = internalMutation(models.ingest)
export const listAvailableStates = internalQuery(models.listAvailableStates)
export const setAvailability = internalMutation(models.setAvailability)
