import * as R from 'remeda'
import { z } from 'zod'

import { registry } from '../catalog/registry'
import { defineMutationSpec } from '../lib/functionSpec'
import { createIngestSummary, ingestArgsValidator, ingestSummaryValidator } from './shared'

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

    const model_base = compact({
      slug,
      version_slug: raw.permaslug,
      variant,
      name: raw.short_name,
      description: raw.description,
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

    return { model_base }
  })

export function parseModelBundle(args: { item: Record<string, unknown> }) {
  return rawModelSchema.parse(args.item)
}

export const ingestModels = defineMutationSpec({
  args: ingestArgsValidator,
  returns: ingestSummaryValidator,
  handler: async (ctx, args) => {
    const summary = createIngestSummary()

    for (const item of args.items) {
      summary.processed += 1

      try {
        const { model_base } = parseModelBundle({ item })
        const entityKey = model_base.slug
        const data = model_base

        const state = await registry.bump.handler(ctx, {
          entityKind: 'model',
          entityAspect: 'base',
          entityKey,
          sinceAt: args.sinceAt,
          source: args.source,
          data,
        })

        if (!state) {
          summary.unchanged += 1
          continue
        }

        await ctx.db.insert('catalog_models_base', {
          ...data,
          since_at: args.sinceAt,
          state_id: state.stateId,
          sequence: state.sequence,
        })

        summary.changed += 1
      } catch (error) {
        summary.failed += 1
        console.log('[ingestion:model] failed to parse or store item', {
          sinceAt: args.sinceAt,
          source: args.source,
          item,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return summary
  },
})
