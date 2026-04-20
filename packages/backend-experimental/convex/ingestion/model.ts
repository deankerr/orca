import { v } from 'convex/values'
import * as R from 'remeda'
import { z } from 'zod'

import { modelDataFields, modelDescriptionDataFields } from '../catalog/models/table'
import { defineMutationSpec } from '../lib/functionSpec'
import { bumpVersion, commitMetadataValidator } from './shared'

// Drop nullish values so version hashes only reflect meaningful payload changes.
function compact<T extends Record<string, unknown>>(value: T) {
  return R.pickBy(value, R.isNonNullish)
}

// Normalize one raw model payload into the independent model streams we store.
const rawModelSchema = z
  .object({
    slug: z.string(),
    hf_slug: z.string().nullable(),
    created_at: z
      .string()
      .transform((value) => Date.parse(value))
      .pipe(z.number()),
    short_name: z.string(),
    description: z.string(),
    author: z.string(),
    author_display_name: z.string().optional(),
    context_length: z.number(),
    input_modalities: z.array(z.string()).transform((value) => value.toSorted()),
    output_modalities: z.array(z.string()).transform((value) => value.toSorted()),
    promotion_message: z.string().nullable(),
    warning_message: z.string().nullable(),
    routing_error_message: z.string().nullable(),
    permaslug: z.string(),
    endpoint: z
      .object({
        variant: z.string(),
      })
      .transform((value) => value.variant)
      .nullable(),
    supports_reasoning: z.boolean(),
  })
  .transform((raw) => {
    const variant = raw.endpoint ?? 'standard'
    const slug = variant === 'standard' ? raw.slug : `${raw.slug}:${variant}`

    const modelRecord = compact({
      id: slug,
      versionSlug: raw.permaslug,
      variant,
      name: raw.short_name,
      authorSlug: raw.author,
      authorName: raw.author_display_name ?? raw.author,
      orAddedAt: raw.created_at,
      inputModalities: raw.input_modalities,
      outputModalities: raw.output_modalities,
      reasoning: raw.supports_reasoning,
      huggingFaceId: raw.hf_slug,
      promotionMessage: raw.promotion_message,
      warningMessage: raw.warning_message,
      routingErrorMessage: raw.routing_error_message,
    })

    const modelDescriptionRecord = {
      id: slug,
      description: raw.description,
    }

    return {
      id: slug,
      modelRecord,
      modelDescriptionRecord,
    }
  })

// Model identity and endpoint targeting are stable enough to gate the whole workflow.
const rawModelIdentitySchema = z
  .object({
    slug: z.string(),
    permaslug: z.string(),
    endpoint: z
      .object({
        variant: z.string(),
      })
      .nullable(),
  })
  .transform((raw) => {
    const variant = raw.endpoint?.variant ?? 'standard'
    const id = variant === 'standard' ? raw.slug : `${raw.slug}:${variant}`

    return {
      id,
      target:
        raw.endpoint === null
          ? null
          : {
              permaslug: raw.permaslug,
              variant: raw.endpoint.variant,
            },
    }
  })

export function parseModelBundle(args: { item: Record<string, unknown> }) {
  return rawModelSchema.parse(args.item)
}

export function parseModelIdentity(args: { item: Record<string, unknown> }) {
  return rawModelIdentitySchema.parse(args.item)
}

// Commit both model streams together so the catalog never exposes a split write.
export const ingestModels = defineMutationSpec({
  args: {
    ...commitMetadataValidator,
    entity: v.object({
      id: v.string(),
      modelRecord: v.object(modelDataFields),
      modelDescriptionRecord: v.object(modelDescriptionDataFields),
    }),
  },
  handler: async (ctx, args) => {
    const modelWithVersion = await bumpVersion(ctx, {
      table: 'catalog_models',
      id: args.entity.id,
      data: args.entity.modelRecord,
      firstSeenAt: args.firstSeenAt,
    })

    const descriptionWithVersion = await bumpVersion(ctx, {
      table: 'catalog_model_descriptions',
      id: args.entity.id,
      data: args.entity.modelDescriptionRecord,
      firstSeenAt: args.firstSeenAt,
    })

    if (modelWithVersion) {
      await ctx.db.insert('catalog_models', modelWithVersion)
    }

    if (descriptionWithVersion) {
      await ctx.db.insert('catalog_model_descriptions', descriptionWithVersion)
    }

    return {
      changed: modelWithVersion !== null || descriptionWithVersion !== null,
    }
  },
})
