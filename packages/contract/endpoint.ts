import { z } from 'zod'

// Contract fields are always present; null means ORCA does not know the fact.
const flag = (description: string) => z.boolean().nullable().meta({ description })
const count = (description: string) =>
  z.number().int().nonnegative().nullable().meta({ description })

/** Upstream meter rate; sentinel values such as router `-1` are not rates. */
export const MeterRate = z
  .string()
  // oxlint-disable-next-line require-unicode-regexp -- The OpenAPI generator copies regex flags into `pattern`.
  .regex(/^\d+(?:\.\d+)?$/)
  .meta({ description: 'Upstream decimal string, preserving its precision.', example: '0.0000025' })

export const EndpointModel = z
  .object({
    created_at: z.iso.datetime().meta({ description: 'Upstream model creation time.' }),
    id: z.string().meta({
      description: 'Model slug, including any variant suffix.',
      example: 'xingchen-agi/xing4.0-29b-a4b:free',
    }),
    name: z.string().meta({ description: 'Model display name.' }),
    variant: z.string().meta({ description: 'Model variant, such as `standard` or `free`.' }),
  })
  .meta({ description: 'The model this endpoint serves.' })

export const EndpointProvider = z
  .object({
    id: z.string().meta({ description: 'ORCA-normalized provider slug.', example: 'deepinfra' }),
    name: z.string().meta({ description: 'Provider display name, shared by all its endpoints.' }),
    tag: z.string().meta({
      description: 'Upstream routing key for this endpoint; it can change or be shared.',
      example: 'deepinfra/fp4',
    }),
  })
  .meta({ description: 'The provider serving this endpoint.' })

export const EndpointDataPolicy = z
  .object({
    can_publish: flag('The provider may publish prompts.'),
    requires_user_ids: flag('Requests must carry a user ID.'),
    retains_prompts: flag('The provider retains prompts.'),
    retention_days: count('Prompt retention period in days.'),
    training: flag('The provider may train on prompts.'),
  })
  .meta({ description: 'Upstream data policy for this endpoint.' })

export const EndpointPricing = z
  .object({
    discount: z.number().meta({ description: 'Upstream discount fraction applied to meters.' }),
    meters: z.record(z.string(), MeterRate).meta({
      description:
        'Upstream meter rates in USD, keyed by upstream meter name. Token meters are per token. ' +
        'Zero rates are preserved; `internal_reasoning` is not published.',
      example: { completion: '0.00000018', input_cache_read: '0.000000012', prompt: '0.00000006' },
    }),
    overrides: z
      .array(z.record(z.string(), z.unknown()))
      .nullable()
      .meta({ description: 'Upstream conditional pricing, such as long-context rates.' }),
  })
  .meta({ description: 'Current price quote.' })

export const EndpointStats = z
  .object({
    p50_latency_ms: z
      .number()
      .nonnegative()
      .nullable()
      .meta({ description: 'Median latency in milliseconds.' }),
    p50_throughput_tps: z
      .number()
      .nonnegative()
      .nullable()
      .meta({ description: 'Median throughput in tokens per second.' }),
  })
  .meta({ description: 'Default-tier readings at the latest processed scan; null while unlisted.' })

export const Endpoint = z
  .object({
    context_length: count('Maximum context length in tokens.'),
    data_policy: EndpointDataPolicy,
    has_chat_completions: flag('Serves the chat completions API.'),
    has_completions: flag('Serves the legacy completions API.'),
    id: z.string().meta({ description: 'Upstream endpoint UUID; stable across relistings.' }),
    input_modalities: z.array(z.string()).meta({ description: 'Accepted input modalities.' }),
    is_deranked: flag('OpenRouter routes to this endpoint only as a fallback.'),
    is_disabled: flag('OpenRouter has disabled this endpoint.'),
    is_zdr: flag('Zero data retention.'),
    label: z.string().meta({
      description:
        'Upstream endpoint label; it can differ between a provider’s endpoints and models.',
      example: 'DeepInfra (fp8)',
    }),
    limit_rpd: count('Requests per day.'),
    limit_rpm: count('Requests per minute.'),
    max_completion_tokens: count('Maximum output tokens.'),
    max_prompt_tokens: count('Maximum input tokens.'),
    max_tokens_per_image: count('Maximum tokens per input image.'),
    model: EndpointModel,
    moderation_required: flag('OpenRouter moderates content before forwarding it.'),
    output_modalities: z.array(z.string()).meta({ description: 'Produced output modalities.' }),
    pricing: EndpointPricing,
    provider: EndpointProvider,
    quantization: z.string().nullable().meta({ description: 'Upstream quantization label.' }),
    stats: EndpointStats,
    supported_parameters: z
      .array(z.string())
      .nullable()
      .meta({ description: 'Request parameters the endpoint accepts.' }),
    supports_native_web_search: flag('Searches the web natively.'),
    supports_reasoning: flag('Produces reasoning tokens.'),
    unlisted_at: z.iso
      .datetime()
      .nullable()
      .meta({ description: 'Scan time at which ORCA observed unlisting; null while listed.' }),
  })
  .meta({ description: 'A provider’s serving resource for a model.', id: 'Endpoint' })

export type Endpoint = z.infer<typeof Endpoint>
