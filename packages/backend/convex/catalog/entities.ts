import { v } from 'convex/values'
import { z } from 'zod'

import { JsonObject } from '../json'
import { Pricing } from './pricing'

/** ORCA model fields shared by Catalog and Events; remaining source fields belong to metadata. */
export const Model = z.object({
  display_name: z.string(),
  input_modalities: z.array(z.string()),
  metadata: JsonObject,
  model_id: z.string(),
  or_created_at: z.string(),
  output_modalities: z.array(z.string()),
  permaslug: z.string(),
  slug: z.string(),
  variant: z.string(),
})

/** ORCA provider fields, independent of endpoint-specific provider labels. */
export const Provider = z.object({
  display_name: z.string(),
  metadata: JsonObject,
  provider_id: z.string(),
})

/** ORCA endpoint fields and normalized pricing; stats are handled separately. */
export const Endpoint = z.object({
  endpoint_id: z.string(),
  input_modalities: z.array(z.string()),
  metadata: JsonObject,
  model_display_name: z.string(),
  model_id: z.string(),
  model_or_created_at: z.string(),
  model_permaslug: z.string(),
  output_modalities: z.array(z.string()),
  pricing: Pricing,
  provider_display_name: z.string(),
  provider_id: z.string(),
  provider_tag: z.string(),
  variant: z.string(),
})

/** Identifying facts retained with an entity event, independent of any materialized view. */
export const modelIdentity = v.object({
  display_name: v.string(),
  model_id: v.string(),
})

export const providerIdentity = v.object({
  display_name: v.string(),
  provider_id: v.string(),
})

export const endpointIdentity = v.object({
  endpoint_id: v.string(),
  provider_display_name: v.string(),
  provider_tag: v.string(),
})
