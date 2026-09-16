import { z } from 'zod'

/** Lightweight model details shared by endpoint rows and selection controls. */
export const Model = z.object({
  _id: z.string(),
  _creationTime: z.number(),
  model_id: z.string(),
  display_name: z.string(),
  permaslug: z.string(),
  variant: z.string(),
  input_modalities: z.array(z.string()),
  output_modalities: z.array(z.string()),
  // Canonical UTC strings are serializable and sort chronologically across consumers.
  or_created_at: z
    .string()
    .pipe(z.coerce.date())
    .transform((date) => date.toISOString()),
})

export type Model = z.infer<typeof Model>
