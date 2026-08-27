import { z } from 'zod'

const NullableNumberRangeSchema = z.looseObject({
  max: z.number().nullable().optional(),
  min: z.number().nullable().optional(),
})

export const SupportedImageParametersSchema = z.looseObject({
  aspect_ratios: z.array(z.string()).nullable().optional(),
  backgrounds: z.array(z.string()).nullable().optional(),
  input_references: NullableNumberRangeSchema.optional(),
  n: NullableNumberRangeSchema.optional(),
  output_compression: NullableNumberRangeSchema.nullable().optional(),
  output_formats: z.array(z.string()).nullable().optional(),
  qualities: z.array(z.string()).nullable().optional(),
  resolutions: z.array(z.string()).nullable().optional(),
  seed: z.boolean().nullable().optional(),
})

export const SupportedVideoParametersSchema = z.looseObject({
  creativity: z.array(z.number().min(0).max(1)).optional(),
  generate_audio: z.boolean().nullable().optional(),
  seed: z.boolean().nullable().optional(),
  supported_aspect_ratios: z.array(z.string()).nullable().optional(),
  supported_durations: z.array(z.number()).nullable().optional(),
  supported_frame_images: z.array(z.string()).nullable().optional(),
  supported_resolutions: z.array(z.string()).nullable().optional(),
  supported_sizes: z.array(z.string()).nullable().optional(),
  upscale_factor: z
    .looseObject({
      max: z.number(),
      min: z.number(),
    })
    .optional(),
})
