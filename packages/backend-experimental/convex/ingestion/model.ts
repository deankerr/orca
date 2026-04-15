import * as R from 'remeda'
import { z } from 'zod'

import { versions } from '../catalog/versions'
import { defineMutationSpec } from '../lib/functionSpec'
import { createIngestSummary, ingestArgsValidator } from './shared'

function compact<T extends Record<string, unknown>>(value: T) {
  return R.pickBy(value, R.isNonNullish)
}

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
      version_slug: raw.permaslug,
      variant,
      name: raw.short_name,
      author_slug: raw.author,
      author_name: raw.author_display_name ?? raw.author,
      or_added_at: raw.created_at,
      input_modalities: raw.input_modalities,
      output_modalities: raw.output_modalities,
      reasoning: raw.supports_reasoning,
      hugging_face_id: raw.hf_slug,
      promotion_message: raw.promotion_message,
      warning_message: raw.warning_message,
      routing_error_message: raw.routing_error_message,
    })

    const modelDescriptionRecord = {
      id: slug,
      description: raw.description,
    }

    return { modelRecord, modelDescriptionRecord }
  })

export function parseModelBundle(args: { item: Record<string, unknown> }) {
  return rawModelSchema.parse(args.item)
}

export const ingestModels = defineMutationSpec({
  args: ingestArgsValidator,
  handler: async (ctx, args) => {
    const summary = createIngestSummary()

    for (const item of args.items) {
      summary.processed += 1

      try {
        const { modelRecord, modelDescriptionRecord } = parseModelBundle({ item })
        const { id } = modelRecord
        const baseData = modelRecord
        const descriptionData = modelDescriptionRecord
        let itemChanged = false

        const currentBaseVersion = await versions.bump.handler(ctx, {
          scopeTable: 'catalog_models',
          id,
          firstSeenAt: args.firstSeenAt,
          source: args.source,
          data: baseData,
        })

        if (currentBaseVersion) {
          await ctx.db.insert('catalog_models', {
            ...baseData,
            first_seen_at: args.firstSeenAt,
            version_id: currentBaseVersion.versionId,
            version: currentBaseVersion.version,
          })

          itemChanged = true
        }

        const currentDescriptionVersion = await versions.bump.handler(ctx, {
          scopeTable: 'catalog_model_descriptions',
          id,
          firstSeenAt: args.firstSeenAt,
          source: args.source,
          data: descriptionData,
        })

        if (currentDescriptionVersion) {
          await ctx.db.insert('catalog_model_descriptions', {
            ...descriptionData,
            first_seen_at: args.firstSeenAt,
            version_id: currentDescriptionVersion.versionId,
            version: currentDescriptionVersion.version,
          })

          itemChanged = true
        }

        if (itemChanged) {
          summary.changed += 1
        } else {
          summary.unchanged += 1
        }
      } catch (error) {
        summary.failed += 1
        console.log('[ingestion:model] failed to parse or store item', {
          firstSeenAt: args.firstSeenAt,
          source: args.source,
          item,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return summary
  },
})
