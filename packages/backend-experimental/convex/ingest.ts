import { internalMutation } from './_generated/server'
import { ingest } from './ingestion'

// These commit boundaries are internal implementation details of collection.
export const models = internalMutation(ingest.model)
export const providers = internalMutation(ingest.provider)
