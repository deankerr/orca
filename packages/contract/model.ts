import { z } from 'zod'

// Contract fields are always present; null means ORCA does not know the fact.
const text = (description: string) => z.string().nullable().meta({ description })

const flag = (description: string) => z.boolean().nullable().meta({ description })

const date = (description: string) => z.iso.datetime().nullable().meta({ description })

export const ModelReasoningConfig = z
  .object({
    default_reasoning_effort: text('Effort applied when a request sets none.'),
    default_reasoning_enabled: flag('Reasoning is on when a request does not set it.'),
    is_mandatory_reasoning: flag('Reasoning cannot be disabled.'),
    reasoning_return_mechanism: text(
      'How reasoning is returned, such as `reasoning-content`; `none` means it is not returned.',
    ),
    supported_reasoning_efforts: z
      .array(z.string())
      .nullable()
      .meta({
        description: 'Accepted `reasoning.effort` values.',
        example: ['low', 'high', 'max'],
      }),
    supports_reasoning_max_tokens: flag('Accepts a `reasoning.max_tokens` budget.'),
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
    default_parameters: z.record(z.string(), z.unknown()).nullable().meta({
      description: 'Values OpenRouter applies when a request omits a parameter; null means none.',
    }),
    deprecation_date: date(
      'Scheduled variant removal; upstream `variant_deprecation_date`, with placeholder dates null.',
    ),
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
    merges_system_messages: flag('System messages are moved to the start and merged into one.'),
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
    supports_reasoning: flag('Produces reasoning tokens.'),
    variant: z.string().meta({ description: 'Model variant, such as `standard` or `free`.' }),
    warning_message: text('OpenRouter’s warning for this model; some describe one endpoint.'),
  })
  .meta({ description: 'A model offering, identified by its slug.', id: 'Model' })

export type Model = z.infer<typeof Model>
