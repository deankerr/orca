import { internalMutation, internalQuery, query } from './_generated/server'
import { models } from './catalog/models'

export const get = query(models.get)
export const history = query(models.history)
export const list = query(models.list)

export const commit = internalMutation(models.commit)
export const listStates = internalQuery(models.listStates)
export const markUnavailable = internalMutation(models.markUnavailable)
