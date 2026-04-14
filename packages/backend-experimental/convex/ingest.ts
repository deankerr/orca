import { mutation } from './_generated/server'
import { ingest } from './ingestion'

export const endpoints = mutation(ingest.endpoint)
export const models = mutation(ingest.model)
export const providers = mutation(ingest.provider)
