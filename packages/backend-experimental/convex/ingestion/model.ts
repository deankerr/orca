import * as R from 'remeda'
import { z } from 'zod'

import { defineMutationSpec } from '../lib/functionSpec'
import { bumpVersion, createIngestSummary, ingestArgsValidator } from './shared'

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
        const { id, modelRecord, modelDescriptionRecord } = parseModelBundle({ item })

        let itemChanged = false

        // Check version and insert model base record if changed
        const modelWithVersion = await bumpVersion(ctx, {
          table: 'catalog_models',
          id,
          data: modelRecord,
          firstSeenAt: args.firstSeenAt,
          source: args.source,
        })
        if (modelWithVersion) {
          await ctx.db.insert('catalog_models', modelWithVersion)
          itemChanged = true
        }

        // Check version and insert model description record if changed
        const descriptionWithVersion = await bumpVersion(ctx, {
          table: 'catalog_model_descriptions',
          id,
          data: modelDescriptionRecord,
          firstSeenAt: args.firstSeenAt,
          source: args.source,
        })
        if (descriptionWithVersion) {
          await ctx.db.insert('catalog_model_descriptions', descriptionWithVersion)
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
