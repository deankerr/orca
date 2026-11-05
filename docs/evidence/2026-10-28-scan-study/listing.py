"""Write the provisional property listing with frequencies from the retained scan.

Usage: python3 -I listing.py [--scan PATH] --output DIR

Definitions here are provisional product choices made on 2026-10-28; counting rules follow analyze.py.
A property is active when its resolver returns a truthy value; valued properties return that value.
"""

import argparse
import csv
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import analyze as a  # noqa: E402

L = []


def define(key, name, entity, group, polarity, source, description, fn, notes=''):
    L.append({
        'key': key, 'name': name, 'entity': entity, 'group': group, 'polarity': polarity,
        'source': source, 'description': description, 'notes': notes, 'fn': fn,
    })


def param(name):
    return lambda r: name in r.params


def tier(row):
    return row.ep.get('derived_service_tier') or row.ep.get('service_tier')


# Modalities. Text input and output hold for the whole scope and are not listed.
for mod, label in (('image', 'Image'), ('file', 'File'), ('video', 'Video'), ('audio', 'Audio')):
    define(f'{mod}_input', f'{label} Input', 'model', 'modality', 'positive', f"model.input_modalities has '{mod}'",
           f'Accepts {mod} content in requests.', lambda r, m=mod: m in r.model['input_modalities'])
for mod, label in (('image', 'Image'), ('audio', 'Audio')):
    define(f'{mod}_output', f'{label} Output', 'model', 'modality', 'positive', f"model.output_modalities has '{mod}'",
           f'Can return {mod} content alongside text.', lambda r, m=mod: m in r.model['output_modalities'])

# Reasoning.
define('reasoning', 'Reasoning', 'model', 'reasoning', 'positive', 'supports_reasoning on model or endpoint',
       'Produces reasoning tokens before its answer.', a.reasoning)
define('reasoning_mandatory', 'Mandatory Reasoning', 'model', 'reasoning', 'neutral',
       'is_mandatory_reasoning on model reasoning_config or endpoint features',
       'Reasoning cannot be turned off.', a.mandatory_reasoning)
define('reasoning_default_off', 'Reasoning Off by Default', 'model', 'reasoning', 'neutral',
       'reasoning_config.default_reasoning_enabled false',
       'Reasons only when a request enables it.', lambda r: a.reasoning(r) and r.rc.get('default_reasoning_enabled') is False)
define('reasoning_effort', 'Reasoning Effort', 'model', 'reasoning', 'positive', 'reasoning_config.supported_reasoning_efforts',
       'Accepts these reasoning effort levels.', a.efforts)
define('reasoning_default_effort', 'Default Effort', 'model', 'reasoning', 'neutral', 'reasoning_config.default_reasoning_effort',
       'Effort level used when a request does not set one.', lambda r: r.rc.get('default_reasoning_effort'))
define('reasoning_budget', 'Reasoning Budget', 'model', 'reasoning', 'positive', 'reasoning_config.supports_reasoning_max_tokens',
       'Accepts a reasoning token budget (reasoning.max_tokens).', lambda r: r.rc.get('supports_reasoning_max_tokens') is True)
define('reasoning_hidden', 'Hidden Reasoning', 'model', 'reasoning', 'negative',
       "reasoning_return_mechanism 'none' on model or endpoint",
       'Reasons, but does not return its reasoning.', lambda r: a.return_mechanism(r) == 'none')

# Tools.
define('tools', 'Tools', 'endpoint', 'tools', 'positive', "supported_parameters has 'tools'",
       'Function calling through the tools parameter.', param('tools'))
define('tool_choice', 'Tool Choice', 'endpoint', 'tools', 'positive', "supported_parameters has 'tool_choice'",
       'Accepts the tool_choice parameter.', param('tool_choice'))
define('tool_choice_required', 'Required Tool Choice', 'endpoint', 'tools', 'positive',
       "tools, and features.supports_tool_choice.literal_required",
       "Can force a tool call with tool_choice 'required'.",
       lambda r: 'tools' in r.params and 'literal_required' in a.tool_choice(r))
define('tool_choice_named', 'Named Tool Choice', 'endpoint', 'tools', 'positive',
       'tools, and features.supports_tool_choice.type_function',
       'Can force a call to one named function.', lambda r: 'tools' in r.params and 'type_function' in a.tool_choice(r))
define('parallel_tool_calls', 'Parallel Tool Calls', 'endpoint', 'tools', 'positive', "supported_parameters has 'parallel_tool_calls'",
       'Accepts parallel_tool_calls to allow or prevent several tool calls in one turn.', param('parallel_tool_calls'),
       'Control parameter, not a sampling parameter. Absence does not establish that calls are never parallel.')
define('native_web_search', 'Native Web Search', 'endpoint', 'tools', 'positive', 'features.supports_native_web_search',
       "The provider runs web search itself instead of OpenRouter's plugin.",
       lambda r: r.features.get('supports_native_web_search') is True,
       'A web-search price does not imply this.')
define('native_web_fetch', 'Native Web Fetch', 'endpoint', 'tools', 'positive', 'features.supports_native_web_fetch',
       'The provider fetches URLs itself.', lambda r: r.features.get('supports_native_web_fetch') is True)
define('native_apply_patch', 'Native Apply Patch', 'endpoint', 'tools', 'positive', 'features.supports_native_apply_patch',
       "The provider's native file-patch tool is available.", lambda r: r.features.get('supports_native_apply_patch') is True)

# Output control.
define('response_format', 'Response Format', 'endpoint', 'output', 'positive', "supported_parameters has 'response_format'",
       'JSON mode: response_format type json_object.', param('response_format'))
define('structured_outputs', 'Structured Outputs', 'endpoint', 'output', 'positive', "supported_parameters has 'structured_outputs'",
       'Enforces a JSON schema: response_format type json_schema.', param('structured_outputs'))
define('logprobs', 'Logprobs', 'endpoint', 'output', 'positive', "supported_parameters has 'logprobs'",
       'Returns token log probabilities.', param('logprobs'), "Listed together with 'top_logprobs' on every endpoint.")
define('predicted_outputs', 'Predicted Outputs', 'endpoint', 'output', 'positive', "supported_parameters has 'prediction'",
       'Accepts predicted output text to speed up mostly-known responses, such as code edits.', param('prediction'),
       "OpenAI's Predicted Outputs; listed on GPT-4o (openai) and Codestral (mistral).")
define('web_search_options', 'Web Search Options', 'endpoint', 'output', 'positive', "supported_parameters has 'web_search_options'",
       'Accepts web_search_options for search-augmented models.', param('web_search_options'),
       'OpenAI, Azure, Perplexity, and Sakana search-style models.')
define('verbosity', 'Verbosity', 'endpoint', 'output', 'positive', "supported_parameters has 'verbosity'",
       'Accepts a verbosity level for response length.', param('verbosity'))

# Sampling and request parameters; candidates for a dedicated parameter filter.
for key, name, notes in (
    ('temperature', 'Temperature', ''),
    ('top_p', 'Top P', ''),
    ('top_k', 'Top K', ''),
    ('min_p', 'Min P', ''),
    ('top_a', 'Top A', 'Mostly Mancer.'),
    ('frequency_penalty', 'Frequency Penalty', ''),
    ('presence_penalty', 'Presence Penalty', ''),
    ('repetition_penalty', 'Repetition Penalty', ''),
    ('seed', 'Seed', ''),
    ('stop', 'Stop Sequences', ''),
    ('logit_bias', 'Logit Bias', ''),
    ('max_tokens', 'Max Tokens', ''),
    ('max_completion_tokens', 'Max Completion Tokens', 'Alias of max_tokens; mostly Azure.'),
    ('reasoning_effort', 'Reasoning Effort Parameter', 'Top-level alias of reasoning.effort on 20 endpoints.'),
):
    define(f'param_{key}', name, 'endpoint', 'parameter', 'neutral', f"supported_parameters has '{key}'",
           f'Accepts {key}.', param(key), notes)
define('passthrough', 'Passthrough Parameters', 'endpoint', 'parameter', 'neutral', 'allowed_passthrough_parameters',
       'Forwards these provider-specific parameters unchanged.',
       lambda r: ' '.join(sorted(r.passthrough)) or None)

# Protocol.
define('completions', 'Completions', 'endpoint', 'protocol', 'neutral', 'has_completions',
       'Legacy /completions endpoint for raw text continuation.', lambda r: r.ep['has_completions'])
define('no_abort', 'No Abort', 'endpoint', 'protocol', 'negative', 'can_abort false',
       'Cancelling a request may not stop generation upstream, and the full response can still be billed.',
       lambda r: not r.ep['can_abort'], "Description follows OpenRouter's stream-cancellation guide; recheck before publishing.")
define('system_merged', 'System Prompt Merged', 'model', 'protocol', 'neutral',
       'features.chat_template_config.should_hoist_and_merge_system_messages',
       'System messages are moved to the start and merged into one.',
       lambda r: ((r.model.get('features') or {}).get('chat_template_config') or {}).get('should_hoist_and_merge_system_messages') is True)
define('recommended_sampling', 'Recommended Sampling', 'model', 'protocol', 'neutral', 'default_parameters (non-null keys)',
       'Has recommended sampling defaults for these parameters.',
       lambda r: ' '.join(sorted(k for k, v in (r.model.get('default_parameters') or {}).items() if v is not None)) or None)

# Data policy.
define('zdr', 'ZDR', 'endpoint', 'data policy', 'positive', 'is_zdr',
       'Zero data retention: prompts are not retained.', lambda r: r.ep['is_zdr'],
       "Equals not retainsPrompts on every endpoint. The 'zdr' tag segment marks 33 of these.")
define('prompt_retention', 'Prompt Retention', 'endpoint', 'data policy', 'negative', 'data_policy.retainsPrompts, with retentionDays',
       'Retains prompts, for this many days when stated.', a.retention_days)
define('training', 'Training', 'endpoint', 'data policy', 'negative', 'data_policy.training',
       'The provider may train on prompts.', lambda r: r.ep['data_policy']['training'])
define('training_openrouter', 'OpenRouter Training', 'endpoint', 'data policy', 'negative', 'data_policy.trainingOpenRouter',
       'OpenRouter may train on prompts.', lambda r: r.ep['data_policy']['trainingOpenRouter'],
       'Undocumented key; only free variants.')
define('safety_retention', 'Safety Retention', 'endpoint', 'data policy', 'negative', 'data_policy.safetyRetention',
       'Retains prompts for safety review.', lambda r: r.ep['data_policy']['safetyRetention'],
       'Undocumented key; only google-vertex, each with retainsPrompts false.')
define('user_id_required', 'User ID Required', 'endpoint', 'data policy', 'neutral', 'data_policy.requiresUserIDs',
       'Requests must identify the end user.', lambda r: r.ep['data_policy'].get('requiresUserIDs') is True)
define('moderated', 'Moderated', 'endpoint', 'data policy', 'neutral', 'moderation_required',
       'OpenRouter screens content before forwarding.', lambda r: r.ep['moderation_required'])

# Limits.
define('limit_rpm', 'Requests/Min', 'endpoint', 'limits', 'negative', 'limit_rpm',
       'Rate limited to this many requests per minute.', lambda r: r.ep.get('limit_rpm'), 'Model-level values are ignored.')
define('limit_rpd', 'Requests/Day', 'endpoint', 'limits', 'negative', 'limit_rpd',
       'Rate limited to this many requests per day.', lambda r: r.ep.get('limit_rpd'), 'Model-level values are ignored.')
define('input_limit', 'Input Limit', 'endpoint', 'limits', 'negative', 'max_prompt_tokens below context_length',
       'Prompts are capped below the context length.', a.prompt_cap)
define('image_token_limit', 'Image Token Limit', 'endpoint', 'limits', 'negative', 'max_tokens_per_image',
       'Each image is limited to this many tokens.', lambda r: r.ep.get('max_tokens_per_image'))
define('output_limit_unstated', 'Output Limit Unstated', 'endpoint', 'limits', 'neutral', 'max_completion_tokens null',
       'No maximum output length is stated.', lambda r: r.ep.get('max_completion_tokens') is None)
define('reduced_context', 'Reduced Context', 'endpoint', 'limits', 'negative', 'context_length below the widest endpoint of the model',
       'Shorter context than another endpoint of the same model.', a.reduced_context, 'Value is endpoint/widest context.')

# Commercial.
define('free', 'Free', 'model', 'commercial', 'positive', "variant 'free'",
       'Free variant. Usually stricter limits and logging terms.', lambda r: r.entry['variant'] == 'free', 'is_free agrees on every endpoint.')
define('batch', 'Batch', 'model', 'commercial', 'neutral', "variant 'batch'",
       'Asynchronous batch variant.', lambda r: r.entry['variant'] == 'batch')
define('byok_only', 'BYOK Only', 'endpoint', 'commercial', 'negative', 'is_byok_only',
       'Requires your own provider key; OpenRouter credits cannot pay for it.', lambda r: r.ep['is_byok_only'])
define('byok', 'BYOK', 'provider', 'commercial', 'positive', 'provider_info.byokEnabled',
       'The provider accepts your own API key.', lambda r: r.pinfo['byokEnabled'])

# Status.
define('deranked', 'Deranked', 'endpoint', 'status', 'negative', 'is_deranked',
       'Deprioritized in routing; used as a fallback.', lambda r: r.ep['is_deranked'])
define('disabled', 'Disabled', 'endpoint', 'status', 'negative', 'is_disabled',
       'Listed but not serving requests.', lambda r: r.ep['is_disabled'], 'False on every endpoint in this scan.')
define('deprecating', 'Deprecating', 'endpoint', 'status', 'negative',
       'deprecation_date or model variant_deprecation_date, before 2090',
       'Scheduled for removal on this date.', a.deprecation, 'Model variant dates apply to endpoints.')
define('new_endpoint', 'New Endpoint', 'endpoint', 'status', 'neutral', f'created_at within {a.NEW_DAYS} days',
       'Added recently.', lambda r: a.recent(r.ep['created_at'], r), 'created_at is not always first offering.')
define('new_model', 'New Model', 'model', 'status', 'neutral', f'model created_at within {a.NEW_DAYS} days',
       'Model added recently.', lambda r: a.recent(r.model['created_at'], r))
define('warning', 'Warning', 'model', 'status', 'negative', 'warning_message',
       "OpenRouter's warning for this model.", lambda r: a.text(r.model.get('warning_message')),
       'Some messages describe one endpoint, such as Bedrock BYOK-only on Claude Fable.')

# Identity facets.
define('quantization', 'Quantization', 'endpoint', 'facet', 'neutral', "quantization other than 'unknown'",
       'Weight precision.', lambda r: r.ep['quantization'] if r.ep['quantization'] != 'unknown' else None)
define('region', 'Region', 'endpoint', 'facet', 'neutral', 'provider_region',
       'Reported serving region; does not establish residency.', lambda r: r.ep.get('provider_region'))
define('service_tier', 'Service Tier', 'endpoint', 'facet', 'neutral', 'derived_service_tier, else service_tier',
       'Paid speed or priority tier, or discounted flex tier.', tier)

# Model facts.
define('open_weights', 'Open Weights', 'model', 'model facts', 'positive', 'hf_slug present',
       'Weights are published on Hugging Face.', lambda r: a.text(r.model.get('hf_slug')) is not None)
define('knowledge_cutoff', 'Knowledge Cutoff', 'model', 'model facts', 'neutral', 'knowledge_cutoff',
       'Training data extends to this month.', lambda r: (r.model.get('knowledge_cutoff') or '')[:7] or None)

# Provider facts.
define('headquarters', 'Headquarters', 'provider', 'provider', 'neutral', 'provider_info.headquarters',
       "Country of the provider's headquarters.", lambda r: r.pinfo.get('headquarters'))
define('datacenters', 'Datacenters', 'provider', 'provider', 'neutral', 'provider_info.datacenters',
       'Countries where the provider reports datacenters.', lambda r: ' '.join(r.pinfo.get('datacenters') or []) or None)
define('status_page', 'Status Page', 'provider', 'provider', 'neutral', 'provider_info.statusPageUrl',
       'The provider publishes a status page.', lambda r: bool(r.pinfo.get('statusPageUrl')))

# Derived from pricing.
define('caching', 'Caching', 'endpoint', 'pricing', 'positive', 'pricing.input_cache_read',
       'Cache hits are billed at a reduced rate.', lambda r: 'input_cache_read' in r.pricing)
define('cache_write', 'Cache Write', 'endpoint', 'pricing', 'neutral', 'pricing.input_cache_write',
       'Writing to the cache is billed separately.', lambda r: 'input_cache_write' in r.pricing)
define('cache_write_1h', '1h Cache Write', 'endpoint', 'pricing', 'neutral', 'pricing.input_cache_write_1h',
       'Offers a one-hour cache write rate.', lambda r: 'input_cache_write_1h' in r.pricing)
define('web_search_price', 'Web Search Price', 'endpoint', 'pricing', 'neutral', 'pricing.web_search',
       'Web search requests are billed.', lambda r: 'web_search' in r.pricing)
define('long_context_pricing', 'Long-Context Pricing', 'endpoint', 'pricing', 'negative',
       'long/high-context or tiered pricing_json meters, or min_prompt_tokens overrides',
       'Long prompts are billed at higher rates.', a.long_context_pricing)
define('peak_pricing', 'Peak Pricing', 'endpoint', 'pricing', 'neutral', 'utc_start overrides or scheduleWindows',
       'Rates change by time of day.', a.scheduled_pricing, 'Schedules are not parsed yet.')
define('discount', 'Discount', 'endpoint', 'pricing', 'positive', 'pricing.discount above 0',
       'Currently discounted by this fraction.', lambda r: r.pricing['discount'] if r.pricing.get('discount', 0) > 0 else None)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--scan', type=pathlib.Path, default=a.SCAN)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    _, entries = a.load(args.scan)
    scan_at = a.parse_time(entries[0]['scan_at'])
    scoped = [e for e in entries if a.in_scope(e)]
    rows = [a.Row(e, ep, e['endpoints'], scan_at) for e in scoped for ep in e['endpoints']]

    a.P[:] = [(d['key'], d['group'], d['entity'], d['source'], d['fn']) for d in L]
    stats, _ = a.properties(rows)
    out = []
    for d, s in zip(L, stats):
        out.append({
            'key': d['key'], 'name': d['name'], 'entity': d['entity'], 'group': d['group'], 'polarity': d['polarity'],
            'kind': 'value' if s['distinct_values'] else 'flag',
            'endpoints': s['endpoints'], 'share': s['share'], 'models': s['models'], 'providers': s['providers'],
            'models_varying': s['models_varying'], 'values': s['top_values'],
            'source': d['source'], 'description': d['description'], 'notes': d['notes'],
        })
    a.write(args.output / 'listing.csv', out)


if __name__ == '__main__':
    main()
