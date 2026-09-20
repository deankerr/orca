import { internalMutation, internalQuery } from '../_generated/server'
import { catalog } from './definition'

// Names and location deliberately differ from the package's operation names.
export const find = internalQuery(catalog.definitions.lookup)
export const commit = internalMutation(catalog.definitions.insert)
export const erase = internalMutation(catalog.definitions.remove)
