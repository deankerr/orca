import { v } from 'convex/values'
import { z } from 'zod'

import { JsonObject } from '../json'
import { Pricing } from './pricing'

/** ORCA model fields shared by Catalog and Events; remaining source fields belong to metadata. */
export const Model = z.object({
  model_id: z.string(),
  slug: z.string(),
  permaslug: z.string(),
  variant: z.string(),
  display_name: z.string(),
  or_created_at: z.string(),
  input_modalities: z.array(z.string()),
  output_modalities: z.array(z.string()),
  metadata: JsonObject,
})

/** ORCA provider fields, independent of endpoint-specific provider labels. */
export const Provider = z.object({
  provider_id: z.string(),
  display_name: z.string(),
  metadata: JsonObject,
})

/** ORCA endpoint fields and normalized pricing; stats are handled separately. */
export const Endpoint = z.object({
  endpoint_id: z.string(),
  model_id: z.string(),
  provider_id: z.string(),
  provider_tag: z.string(),
  variant: z.string(),
  provider_display_name: z.string(),
  model_display_name: z.string(),
  model_permaslug: z.string(),
  model_or_created_at: z.string(),
  input_modalities: z.array(z.string()),
  output_modalities: z.array(z.string()),
  pricing: Pricing,
  metadata: JsonObject,
})

/** Identifying facts retained with an entity event, independent of any materialized view. */
export const modelIdentity = v.object({
  model_id: v.string(),
  display_name: v.string(),
})

export const providerIdentity = v.object({
  provider_id: v.string(),
  display_name: v.string(),
})

export const endpointIdentity = v.object({
  endpoint_id: v.string(),
  provider_tag: v.string(),
  provider_display_name: v.string(),
})
