import { internalMutation, internalQuery, query } from './_generated/server'
import { endpoints } from './catalog/endpoints'

export const get = query(endpoints.get)
export const history = query(endpoints.history)
export const list = query(endpoints.list)
export const listForModel = query(endpoints.listForModel)

export const commit = internalMutation(endpoints.commit)
export const listStates = internalQuery(endpoints.listStates)
export const markUnavailable = internalMutation(endpoints.markUnavailable)
