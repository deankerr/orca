import { internalMutation, internalQuery, query } from './_generated/server'
import { endpointStatsApi } from './endpointStats/index'

export const insertSample = internalMutation(endpointStatsApi.insertSample)
export const get = internalQuery(endpointStatsApi.get)
export const listForModel = query(endpointStatsApi.listForModel)
