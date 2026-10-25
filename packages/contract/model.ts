import { z } from 'zod'

// Contract fields are always present; null means ORCA does not know the fact.
const text = (description: string) => z.string().nullable().meta({ description })

export const ModelReasoningConfig = z
  .object({
    default_reasoning_effort: text('Effort applied when a request sets none.'),
    is_mandatory_reasoning: z
      .boolean()
      .nullable()
      .meta({ description: 'Reasoning cannot be disabled.' }),
    supported_reasoning_efforts: z
      .array(z.string())
      .nullable()
      .meta({
        description: 'Accepted `reasoning.effort` values.',
        example: ['low', 'high', 'max'],
      }),
  })
  .meta({ description: 'Upstream reasoning configuration.' })

export const Model = z
  .object({
    author: z
      .object({
        id: z
          .string()
          .meta({ description: 'Author slug: the model ID prefix.', example: 'moonshotai' }),
        name: text('Upstream author display name.'),
      })
      .meta({ description: 'The model author.' }),
    created_at: z.iso.datetime().meta({ description: 'Upstream model creation time.' }),
    description: z.string().meta({ description: 'Upstream model description.' }),
    hf_slug: text('Hugging Face repository, for open-weight models.'),
    id: z.string().meta({
      description: 'Model slug, including any variant suffix.',
      example: 'moonshotai/kimi-k3',
    }),
    input_modalities: z.array(z.string()).meta({ description: 'Accepted input modalities.' }),
    knowledge_cutoff: text('Upstream training-data cutoff.'),
    listed_endpoints: z.number().int().nonnegative().meta({
      description: 'Listed endpoints serving this model; zero while none is listed.',
    }),
    name: z.string().meta({ description: 'Model display name.' }),
    output_modalities: z.array(z.string()).meta({ description: 'Produced output modalities.' }),
    permaslug: z.string().meta({
      description: 'Upstream versioned slug.',
      example: 'moonshotai/kimi-k3-20260715',
    }),
    provider_ids: z.array(z.string()).meta({
      description: 'Providers with a listed endpoint for this model, sorted.',
    }),
    reasoning_config: ModelReasoningConfig,
    supports_reasoning: z.boolean().nullable().meta({ description: 'Produces reasoning tokens.' }),
    variant: z.string().meta({ description: 'Model variant, such as `standard` or `free`.' }),
  })
  .meta({ description: 'A model offering, identified by its slug.', id: 'Model' })

export type Model = z.infer<typeof Model>
