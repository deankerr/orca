import type { Endpoint } from '@orca/contract/endpoint'

import { defineProperties, flag, value } from './define'
import type { Scope, Value } from './define'

/** Days after creation during which a model or endpoint counts as new. */
export const NEW_DAYS = 30

const DAY_MS = 86_400_000

const accepts = (endpoint: Endpoint, key: string) => endpoint.supported_parameters?.includes(key)

const offersToolChoice = (endpoint: Endpoint, mode: keyof Endpoint['tool_choice']) =>
  accepts(endpoint, 'tool_choice') === true && endpoint.tool_choice[mode]

const positive = (count: number | null) => count !== null && count > 0 && count

const recent = (timestamp: string | null, at: string) =>
  timestamp !== null && Date.parse(at) - Date.parse(timestamp) < NEW_DAYS * DAY_MS

const nonEmpty = <T>(items: readonly T[] | null) =>
  items !== null && items.length > 0 ? items : null

const parameter = (key: string, name: string) =>
  flag('endpoint', {
    description: `Accepts \`${key}\`.`,
    group: 'parameter',
    name,
    polarity: 'neutral',
    resolve: (endpoint) => accepts(endpoint, key),
  })

/**
 * Endpoint properties: compact facts beyond identity, pricing, and stats.
 *
 * Comments record how upstream states each fact and why we read it this way. Counts come from the
 * 1,484 in-scope endpoints of a 2026-10-28 scan; they are evidence, not invariants.
 * A property that reads a Contract field a row does not yet retain resolves inactive until it does.
 */
export const properties = defineProperties({
  // Modality. Text input and output hold on every in-scope endpoint, so they are not properties.

  image_input: flag('model', {
    description: 'Accepts image content in requests.',
    group: 'modality',
    name: 'Image Input',
    polarity: 'positive',
    resolve: (model) => model.input_modalities.includes('image'),
  }),

  file_input: flag('model', {
    description: 'Accepts file content in requests.',
    group: 'modality',
    name: 'File Input',
    polarity: 'positive',
    resolve: (model) => model.input_modalities.includes('file'),
  }),

  video_input: flag('model', {
    description: 'Accepts video content in requests.',
    group: 'modality',
    name: 'Video Input',
    polarity: 'positive',
    resolve: (model) => model.input_modalities.includes('video'),
  }),

  audio_input: flag('model', {
    description: 'Accepts audio content in requests.',
    group: 'modality',
    name: 'Audio Input',
    polarity: 'positive',
    resolve: (model) => model.input_modalities.includes('audio'),
  }),

  image_output: flag('model', {
    description: 'Can return image content alongside text.',
    group: 'modality',
    name: 'Image Output',
    polarity: 'positive',
    resolve: (model) => model.output_modalities.includes('image'),
  }),

  audio_output: flag('model', {
    description: 'Can return audio content alongside text.',
    group: 'modality',
    name: 'Audio Output',
    polarity: 'positive',
    resolve: (model) => model.output_modalities.includes('audio'),
  }),

  // Reasoning

  /** One endpoint reported `supports_reasoning: false` under a reasoning model; the model wins. */
  reasoning: flag('model', {
    description: 'Produces reasoning tokens before its answer.',
    group: 'reasoning',
    name: 'Reasoning',
    polarity: 'positive',
    resolve: (model) => model.supports_reasoning,
  }),

  /**
   * Upstream states this on the endpoint (86 endpoints) or the model (348 more), never both, so it is
   * an endpoint property that inherits the model's flag.
   */
  reasoning_mandatory: flag('endpoint', {
    description: 'Reasoning cannot be turned off.',
    group: 'reasoning',
    name: 'Mandatory Reasoning',
    polarity: 'neutral',
    resolve: (endpoint, { model }) =>
      endpoint.is_mandatory_reasoning === true ||
      model.reasoning_config.is_mandatory_reasoning === true,
  }),

  /** Only an explicit `false` counts; most reasoning models do not state a default. */
  reasoning_default_off: flag('model', {
    description: 'Reasons only when a request enables it.',
    group: 'reasoning',
    name: 'Reasoning Off by Default',
    polarity: 'neutral',
    resolve: (model) => model.reasoning_config.default_reasoning_enabled === false,
  }),

  /** In upstream order. */
  reasoning_effort: value('model', {
    description: 'Accepts these `reasoning.effort` levels.',
    group: 'reasoning',
    name: 'Reasoning Effort',
    polarity: 'positive',
    resolve: (model) => nonEmpty(model.reasoning_config.supported_reasoning_efforts),
  }),

  reasoning_default_effort: value('model', {
    description: 'Effort level used when a request does not set one.',
    group: 'reasoning',
    name: 'Default Effort',
    polarity: 'neutral',
    resolve: (model) => model.reasoning_config.default_reasoning_effort,
  }),

  reasoning_budget: flag('model', {
    description: 'Accepts a reasoning token budget through `reasoning.max_tokens`.',
    group: 'reasoning',
    name: 'Reasoning Budget',
    polarity: 'positive',
    resolve: (model) => model.reasoning_config.supports_reasoning_max_tokens,
  }),

  /** Model `reasoning_return_mechanism: none`; endpoints never state `none`. Three endpoints. */
  reasoning_hidden: flag('model', {
    description: 'Reasons, but does not return its reasoning.',
    group: 'reasoning',
    name: 'Hidden Reasoning',
    polarity: 'negative',
    resolve: (model) => model.reasoning_config.reasoning_return_mechanism === 'none',
  }),

  // Tools

  /** `supports_tool_parameters` agrees on every endpoint. */
  tools: flag('endpoint', {
    description: 'Function calling through the `tools` parameter.',
    group: 'tools',
    name: 'Tools',
    polarity: 'positive',
    resolve: (endpoint) => accepts(endpoint, 'tools'),
  }),

  /** 20 endpoints accept `tools` without `tool_choice`, 9 of them on Bedrock. */
  tool_choice: flag('endpoint', {
    description: 'Accepts the `tool_choice` parameter.',
    group: 'tools',
    name: 'Tool Choice',
    polarity: 'positive',
    resolve: (endpoint) => accepts(endpoint, 'tool_choice'),
  }),

  /**
   * Upstream states tool-choice modes on 153 endpoints that do not accept `tool_choice`, 137 of them
   * without `tools`, so modes count only alongside the parameter. Every endpoint that accepts
   * `tool_choice` also accepts `tools`.
   */
  tool_choice_required: flag('endpoint', {
    description: 'Can force a tool call with `tool_choice: "required"`.',
    group: 'tools',
    name: 'Required Tool Choice',
    polarity: 'positive',
    resolve: (endpoint) => offersToolChoice(endpoint, 'required'),
  }),

  tool_choice_named: flag('endpoint', {
    description: 'Can force a call to one named function.',
    group: 'tools',
    name: 'Named Tool Choice',
    polarity: 'positive',
    resolve: (endpoint) => offersToolChoice(endpoint, 'function'),
  }),

  /** A control parameter. Its absence does not establish that calls are never parallel. */
  parallel_tool_calls: flag('endpoint', {
    description:
      'Accepts `parallel_tool_calls` to allow or prevent several tool calls in one turn.',
    group: 'tools',
    name: 'Parallel Tool Calls',
    polarity: 'positive',
    resolve: (endpoint) => accepts(endpoint, 'parallel_tool_calls'),
  }),

  /**
   * The value is the price per search, `true` when unpriced (Alibaba). OpenRouter's own web search,
   * backed by Exa, is a separate plugin with its own price. Upstream also quotes `pricing.web_search`
   * on 154 endpoints without native search, mostly Anthropic and OpenAI models on Bedrock, Vertex, and
   * Azure; it appears to follow the model's price, so it is ignored there.
   */
  native_web_search: value('endpoint', {
    description: 'The provider runs web search itself, at this price per search.',
    group: 'tools',
    name: 'Native Web Search',
    polarity: 'positive',
    resolve: (endpoint) =>
      endpoint.supports_native_web_search === true && (endpoint.pricing.web_search ?? true),
  }),

  native_web_fetch: flag('endpoint', {
    description: 'The provider fetches URLs itself.',
    group: 'tools',
    name: 'Native Web Fetch',
    polarity: 'positive',
    resolve: (endpoint) => endpoint.supports_native_web_fetch,
  }),

  native_apply_patch: flag('endpoint', {
    description: 'The provider’s native file-patch tool is available.',
    group: 'tools',
    name: 'Native Apply Patch',
    polarity: 'positive',
    resolve: (endpoint) => endpoint.supports_native_apply_patch,
  }),

  // Output

  response_format: flag('endpoint', {
    description: 'JSON mode through `response_format: { type: "json_object" }`.',
    group: 'output',
    name: 'Response Format',
    polarity: 'positive',
    resolve: (endpoint) => accepts(endpoint, 'response_format'),
  }),

  structured_outputs: flag('endpoint', {
    description: 'Enforces a JSON schema through `response_format: { type: "json_schema" }`.',
    group: 'output',
    name: 'Structured Outputs',
    polarity: 'positive',
    resolve: (endpoint) => accepts(endpoint, 'structured_outputs'),
  }),

  /** Listed together with `top_logprobs` on every endpoint. */
  logprobs: flag('endpoint', {
    description: 'Returns token log probabilities.',
    group: 'output',
    name: 'Logprobs',
    polarity: 'positive',
    resolve: (endpoint) => accepts(endpoint, 'logprobs'),
  }),

  /** OpenAI's Predicted Outputs, through `prediction`; GPT-4o on `openai` and Codestral on `mistral`. */
  predicted_outputs: flag('endpoint', {
    description:
      'Accepts predicted output text to speed up mostly-known responses, such as code edits.',
    group: 'output',
    name: 'Predicted Outputs',
    polarity: 'positive',
    resolve: (endpoint) => accepts(endpoint, 'prediction'),
  }),

  /** Search-style models on OpenAI, Azure, Perplexity, and Sakana. */
  web_search_options: flag('endpoint', {
    description: 'Accepts `web_search_options` for search-augmented models.',
    group: 'output',
    name: 'Web Search Options',
    polarity: 'positive',
    resolve: (endpoint) => accepts(endpoint, 'web_search_options'),
  }),

  verbosity: flag('endpoint', {
    description: 'Accepts a `verbosity` level for response length.',
    group: 'output',
    name: 'Verbosity',
    polarity: 'positive',
    resolve: (endpoint) => accepts(endpoint, 'verbosity'),
  }),

  // Parameters: candidates for a dedicated parameter filter. `include_reasoning` and `reasoning`
  // equal Reasoning on every endpoint, and excluded parameters are not published.

  parameter_frequency_penalty: parameter('frequency_penalty', 'Frequency Penalty'),
  parameter_logit_bias: parameter('logit_bias', 'Logit Bias'),
  /** An alias of `max_tokens`, mostly on Azure. */
  parameter_max_completion_tokens: parameter('max_completion_tokens', 'Max Completion Tokens'),
  parameter_max_tokens: parameter('max_tokens', 'Max Tokens'),
  parameter_min_p: parameter('min_p', 'Min P'),
  parameter_presence_penalty: parameter('presence_penalty', 'Presence Penalty'),
  /** A top-level alias of `reasoning.effort`. */
  parameter_reasoning_effort: parameter('reasoning_effort', 'Reasoning Effort Parameter'),
  parameter_repetition_penalty: parameter('repetition_penalty', 'Repetition Penalty'),
  parameter_seed: parameter('seed', 'Seed'),
  parameter_stop: parameter('stop', 'Stop Sequences'),
  parameter_temperature: parameter('temperature', 'Temperature'),
  /** Mostly Mancer. */
  parameter_top_a: parameter('top_a', 'Top A'),
  parameter_top_k: parameter('top_k', 'Top K'),
  parameter_top_p: parameter('top_p', 'Top P'),

  passthrough: value('endpoint', {
    description: 'Forwards these provider-specific parameters unchanged.',
    group: 'parameter',
    name: 'Passthrough Parameters',
    polarity: 'neutral',
    resolve: (endpoint) => nonEmpty(endpoint.allowed_passthrough_parameters),
  }),

  // Protocol. Chat completions holds on every in-scope endpoint, so it is not a property.

  completions: flag('endpoint', {
    description: 'Legacy `/completions` endpoint for raw text continuation.',
    group: 'protocol',
    name: 'Completions',
    polarity: 'neutral',
    resolve: (endpoint) => endpoint.has_completions,
  }),

  /**
   * `can_abort: false`, which follows the provider: Vertex, Bedrock, Mistral, AI Studio, Alibaba,
   * and SiliconFlow hold most of them. The description follows OpenRouter's stream-cancellation
   * guide; recheck it before publishing.
   */
  no_abort: flag('endpoint', {
    description:
      'Cancelling a request may not stop generation upstream, and the full response can still be billed.',
    group: 'protocol',
    name: 'No Abort',
    polarity: 'negative',
    resolve: (endpoint) => endpoint.can_abort === false,
  }),

  system_merged: flag('model', {
    description: 'System messages are moved to the start and merged into one.',
    group: 'protocol',
    name: 'System Prompt Merged',
    polarity: 'neutral',
    resolve: (model) => model.merges_system_messages,
  }),

  /**
   * Model `default_parameters`: OpenRouter sends these values when a request omits the parameter.
   * Upstream lists parameters with null values when it has no default; those do not count.
   */
  sampling_defaults: value('model', {
    description:
      'OpenRouter applies its own defaults for these parameters when a request omits them.',
    group: 'protocol',
    name: 'Sampling Defaults',
    polarity: 'neutral',
    resolve: (model) =>
      nonEmpty(
        Object.entries(model.default_parameters ?? {}).flatMap(([key, recommended]) =>
          recommended === null ? [] : [key],
        ),
      ),
  }),

  // Data policy

  /** `is_zdr` equals `!retains_prompts` on every endpoint. The `zdr` tag segment is rarer. */
  zdr: flag('endpoint', {
    description: 'Zero data retention: prompts are not retained.',
    group: 'data-policy',
    name: 'ZDR',
    polarity: 'positive',
    resolve: (endpoint) => endpoint.is_zdr,
  }),

  /** Active without a value when upstream does not state the period. */
  prompt_retention: value('endpoint', {
    description: 'Retains prompts, for this many days when stated.',
    group: 'data-policy',
    name: 'Prompt Retention',
    polarity: 'negative',
    resolve: ({ data_policy: policy }) =>
      policy.retains_prompts === true && (policy.retention_days ?? true),
  }),

  training: flag('endpoint', {
    description: 'The provider may train on prompts.',
    group: 'data-policy',
    name: 'Training',
    polarity: 'negative',
    resolve: (endpoint) => endpoint.data_policy.training,
  }),

  /** Undocumented upstream key; only free variants. */
  training_openrouter: flag('endpoint', {
    description: 'OpenRouter may train on prompts.',
    group: 'data-policy',
    name: 'OpenRouter Training',
    polarity: 'negative',
    resolve: (endpoint) => endpoint.data_policy.training_openrouter,
  }),

  /** Undocumented upstream key; only Google Vertex, each with `retains_prompts: false`. */
  safety_retention: flag('endpoint', {
    description: 'Retains prompts for safety review.',
    group: 'data-policy',
    name: 'Safety Retention',
    polarity: 'negative',
    resolve: (endpoint) => endpoint.data_policy.safety_retention,
  }),

  user_id_required: flag('endpoint', {
    description: 'Requests must identify the end user.',
    group: 'data-policy',
    name: 'User ID Required',
    polarity: 'neutral',
    resolve: (endpoint) => endpoint.data_policy.requires_user_ids,
  }),

  moderated: flag('endpoint', {
    description: 'OpenRouter screens content before forwarding it.',
    group: 'data-policy',
    name: 'Moderated',
    polarity: 'neutral',
    resolve: (endpoint) => endpoint.moderation_required,
  }),

  // Limits. Model `limit_rpm` and `limit_rpd` do not describe endpoint limits and are ignored.

  limit_rpm: value('endpoint', {
    description: 'Rate limited to this many requests per minute.',
    group: 'limits',
    name: 'Requests/Min',
    polarity: 'negative',
    resolve: (endpoint) => positive(endpoint.limit_rpm),
  }),

  limit_rpd: value('endpoint', {
    description: 'Rate limited to this many requests per day.',
    group: 'limits',
    name: 'Requests/Day',
    polarity: 'negative',
    resolve: (endpoint) => positive(endpoint.limit_rpd),
  }),

  input_limit: value('endpoint', {
    description: 'Prompts are capped below the context length, at this many tokens.',
    group: 'limits',
    name: 'Input Limit',
    polarity: 'negative',
    resolve: ({ context_length: context, max_prompt_tokens: cap }) =>
      cap !== null && context !== null && cap < context && cap,
  }),

  image_token_limit: value('endpoint', {
    description: 'Each image is limited to this many tokens.',
    group: 'limits',
    name: 'Image Token Limit',
    polarity: 'negative',
    resolve: (endpoint) => endpoint.max_tokens_per_image,
  }),

  // Commercial

  /** Upstream `is_free` agrees on every endpoint. */
  free: flag('model', {
    description: 'Free variant, usually with stricter limits and logging terms.',
    group: 'commercial',
    name: 'Free',
    polarity: 'positive',
    resolve: (model) => model.variant === 'free',
  }),

  batch: flag('model', {
    description: 'Asynchronous batch variant.',
    group: 'commercial',
    name: 'Batch',
    polarity: 'neutral',
    resolve: (model) => model.variant === 'batch',
  }),

  byok_only: flag('endpoint', {
    description: 'Requires your own provider key; OpenRouter credits cannot pay for it.',
    group: 'commercial',
    name: 'BYOK Only',
    polarity: 'negative',
    resolve: (endpoint) => endpoint.is_byok_only,
  }),

  /** False for 15 of 83 providers. */
  byok: flag('provider', {
    description: 'The provider accepts your own API key.',
    group: 'commercial',
    name: 'BYOK',
    polarity: 'positive',
    resolve: (provider) => provider.byok_enabled,
  }),

  // Status. Raw upstream `status` is too volatile and its codes are undocumented.

  deranked: flag('endpoint', {
    description: 'Deprioritized in routing and used as a fallback.',
    group: 'status',
    name: 'Deranked',
    polarity: 'negative',
    resolve: (endpoint) => endpoint.is_deranked,
  }),

  /** False on every endpoint in the 2026-10-28 scan. */
  disabled: flag('endpoint', {
    description: 'Listed but not serving requests.',
    group: 'status',
    name: 'Disabled',
    polarity: 'negative',
    resolve: (endpoint) => endpoint.is_disabled,
  }),

  unlisted: value('endpoint', {
    description: 'No longer listed; last seen before this time.',
    group: 'status',
    name: 'Unlisted',
    polarity: 'negative',
    resolve: (endpoint) => endpoint.unlisted_at,
  }),

  /** The earlier of the endpoint's date and its model variant's date, which applies to every endpoint. */
  deprecating: value('endpoint', {
    description: 'Scheduled for removal at this time.',
    group: 'status',
    name: 'Deprecating',
    polarity: 'negative',
    resolve: (endpoint, { model }) =>
      [endpoint.deprecation_date, model.deprecation_date]
        .filter((date) => date !== null)
        .toSorted()[0],
  }),

  /** Upstream `created_at` is not always when the offering began. */
  new_endpoint: flag('endpoint', {
    description: 'Added recently.',
    group: 'status',
    name: 'New Endpoint',
    polarity: 'neutral',
    resolve: (endpoint, { at }) => recent(endpoint.created_at, at),
  }),

  new_model: flag('model', {
    description: 'Model added recently.',
    group: 'status',
    name: 'New Model',
    polarity: 'neutral',
    resolve: (model, { at }) => recent(model.created_at, at),
  }),

  /** Some messages describe one endpoint, such as Bedrock being BYOK-only for one model. */
  warning: value('model', {
    description: 'OpenRouter’s warning for this model.',
    group: 'status',
    name: 'Warning',
    polarity: 'negative',
    resolve: (model) => model.warning_message,
  }),

  // Facets

  /** Upstream `unknown` is a stated unknown, so it does not count. */
  quantization: value('endpoint', {
    description: 'Weight precision.',
    group: 'facet',
    name: 'Quantization',
    polarity: 'neutral',
    resolve: (endpoint) => endpoint.quantization !== 'unknown' && endpoint.quantization,
  }),

  /** Labels mix broad areas, such as `us`, with cloud regions, such as `eastus2`. */
  region: value('endpoint', {
    description: 'Reported serving region; it does not establish data residency.',
    group: 'facet',
    name: 'Region',
    polarity: 'neutral',
    resolve: (endpoint) => endpoint.provider_region,
  }),

  /** The provider's tier name, such as `fast`, else the upstream tier, such as `priority` or `flex`. */
  service_tier: value('endpoint', {
    description: 'Paid speed or priority tier, or discounted flex tier.',
    group: 'facet',
    name: 'Service Tier',
    polarity: 'neutral',
    resolve: (endpoint) => endpoint.service_tier_label ?? endpoint.service_tier,
  }),

  // Model facts

  /** A Hugging Face repository is our only open-weights signal. */
  open_weights: flag('model', {
    description: 'Weights are published on Hugging Face.',
    group: 'model',
    name: 'Open Weights',
    polarity: 'positive',
    resolve: (model) => model.hf_slug !== null,
  }),

  knowledge_cutoff: value('model', {
    description: 'Training data extends to this date.',
    group: 'model',
    name: 'Knowledge Cutoff',
    polarity: 'neutral',
    resolve: (model) => model.knowledge_cutoff,
  }),

  // Provider facts

  /** An ISO country code. Unset for 18 of 83 providers. */
  headquarters: value('provider', {
    description: 'Country of the provider’s headquarters.',
    group: 'provider',
    name: 'Headquarters',
    polarity: 'neutral',
    resolve: (provider) => provider.headquarters,
  }),

  /** ISO country codes. Set for 23 of 83 providers. */
  datacenters: value('provider', {
    description: 'Countries where the provider reports datacenters.',
    group: 'provider',
    name: 'Datacenters',
    polarity: 'neutral',
    resolve: (provider) => nonEmpty(provider.datacenters),
  }),

  status_page: flag('provider', {
    description: 'The provider publishes a status page.',
    group: 'provider',
    name: 'Status Page',
    polarity: 'neutral',
    resolve: (provider) => provider.status_page_url !== null,
  }),

  // Pricing. These restate the price quote, but they serve filters.

  /** A quoted rate, including zero. 36 endpoints quote one at or above their input rate. */
  caching: flag('endpoint', {
    description: 'Quotes a rate for cache hits.',
    group: 'pricing',
    name: 'Caching',
    polarity: 'positive',
    resolve: (endpoint) => endpoint.pricing.input_cache_read !== null,
  }),

  cache_write: flag('endpoint', {
    description: 'Writing to the cache is billed separately.',
    group: 'pricing',
    name: 'Cache Write',
    polarity: 'neutral',
    resolve: (endpoint) => endpoint.pricing.input_cache_write !== null,
  }),

  cache_write_1h: flag('endpoint', {
    description: 'Offers a one-hour cache write rate.',
    group: 'pricing',
    name: '1h Cache Write',
    polarity: 'neutral',
    resolve: (endpoint) => endpoint.pricing.input_cache_write_1h !== null,
  }),

  /**
   * An override with `min_prompt_tokens`. Upstream also prices long context through meters in
   * `pricing_json`, which ORCA does not publish, so this undercounts.
   */
  long_context_pricing: flag('endpoint', {
    description: 'Long prompts are billed at higher rates.',
    group: 'pricing',
    name: 'Long-Context Pricing',
    polarity: 'negative',
    resolve: (endpoint) =>
      endpoint.pricing.overrides?.some((override) => 'min_prompt_tokens' in override),
  }),

  /**
   * An override with any `utc` condition, as alerts judge schedules; some state only `utc_days`.
   * Upstream also states schedules in `display_pricing`, which ORCA does not publish. Schedules are
   * not parsed yet.
   */
  peak_pricing: flag('endpoint', {
    description: 'Rates change on a UTC schedule.',
    group: 'pricing',
    name: 'Peak Pricing',
    polarity: 'neutral',
    resolve: (endpoint) =>
      endpoint.pricing.overrides?.some((override) =>
        Object.keys(override).some((key) => key.startsWith('utc')),
      ),
  }),

  /** A negative discount is a surcharge; like OpenRouter, ORCA shows it only through the price. */
  discount: value('endpoint', {
    description: 'Currently discounted by this fraction.',
    group: 'pricing',
    name: 'Discount',
    polarity: 'positive',
    resolve: (endpoint) => positive(endpoint.pricing.discount),
  }),
})

export type PropertyId = keyof typeof properties

export function isPropertyId(key: string): key is PropertyId {
  return Object.hasOwn(properties, key)
}

/** Active properties of one endpoint: each value, or `true` when active without one. */
export function activeProperties(scope: Scope): Map<PropertyId, Value | true> {
  const active = new Map<PropertyId, Value | true>()

  for (const [key, definition] of Object.entries(properties)) {
    const resolution = definition.resolve(scope)

    if (isPropertyId(key) && resolution !== null) {
      active.set(key, resolution)
    }
  }

  return active
}
