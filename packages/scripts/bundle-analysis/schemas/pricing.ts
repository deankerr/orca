import { z } from 'zod'

export const JsonObjectSchema = z.record(z.string(), z.json())
const DirectDecimalStringSchema = z
  .string()
  .regex(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u, 'must be a direct decimal string')
const NumericStringSchema = z
  .string()
  .refine(
    (value) => value.trim() !== '' && Number.isFinite(Number(value)),
    'must be a numeric string',
  )
const DisplayPricingKindSchema = z.enum(['schedule', 'token', 'unit'])

const DisplayPricingBaseSchema = z.looseObject({
  displayMultiplier: z.number().positive(),
  isDiscountExempt: z.boolean().optional(),
  isServerTool: z.boolean().optional(),
  price: NumericStringSchema,
  sku_label: z.string(),
  tiers: z
    .array(
      z.looseObject({
        price: NumericStringSchema,
        sku_label: z.string(),
      }),
    )
    .min(1)
    .optional(),
  unitLabel: z.string(),
})

export const DisplayPricingRowSchema = z.discriminatedUnion('kind', [
  DisplayPricingBaseSchema.extend({
    kind: z.literal('schedule'),
    scheduleWindows: z
      .array(
        z.looseObject({
          utc_end: z.number(),
          utc_start: z.number(),
        }),
      )
      .min(1),
  }),
  DisplayPricingBaseSchema.extend({
    kind: DisplayPricingKindSchema.exclude(['schedule']),
    scheduleWindows: z.never().optional(),
  }),
])

const PricingOverrideSchema = z
  .looseObject({
    min_prompt_tokens: z.number().int().nonnegative().optional(),
    utc_end: z.number().optional(),
    utc_start: z.number().optional(),
  })
  .superRefine((override, context) => {
    // Every key outside the observed conditions is a rate meter.
    for (const [field, value] of Object.entries(override)) {
      if (field === 'min_prompt_tokens' || field === 'utc_end' || field === 'utc_start') {
        continue
      }

      if (!NumericStringSchema.safeParse(value).success) {
        context.addIssue({
          code: 'custom',
          message: 'must be a numeric string',
          path: [field],
        })
      }
    }
  })

export const PricingSchema = z
  .looseObject({
    completion: DirectDecimalStringSchema,
    discount: z.number().max(1),
    display_pricing: z.array(DisplayPricingRowSchema),
    overrides: z.array(PricingOverrideSchema).min(1).optional(),
    prompt: DirectDecimalStringSchema,
  })
  .superRefine((pricing, context) => {
    // Every key outside the known structural fields is a normalized meter.
    for (const [field, value] of Object.entries(pricing)) {
      if (field === 'discount' || field === 'display_pricing' || field === 'overrides') {
        continue
      }

      if (!DirectDecimalStringSchema.safeParse(value).success) {
        context.addIssue({
          code: 'custom',
          message: 'must be a direct decimal string',
          path: [field],
        })
      }
    }
  })

export const PricingTierSchema = z.looseObject({
  display_pricing: z.array(DisplayPricingRowSchema),
})

export const TiersSchema = z.looseObject({
  flex: PricingTierSchema.optional(),
  priority: PricingTierSchema.optional(),
})

export const EndpointPricingSourceSchema = z.looseObject({
  display_pricing: z.array(DisplayPricingRowSchema),
  id: z.uuid(),
  pricing: PricingSchema,
  pricing_json: JsonObjectSchema.optional(),
  pricing_version_id: z.string().min(1).optional(),
  provider_slug: z.string().min(1),
  tiers: TiersSchema.optional(),
})

export type EndpointPricingSource = z.infer<typeof EndpointPricingSourceSchema>
