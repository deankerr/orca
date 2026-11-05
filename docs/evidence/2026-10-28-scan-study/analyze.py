"""Profile one retained scan for candidate endpoint properties.

Usage: python3 -I analyze.py [--scan PATH] --output DIR

Counting rules (see README.md):
- Population: ORCA extraction scope, text input and text output models with endpoints, excluding Lyria.
- A model fact is an endpoint fact: model-level values apply to each of the model's endpoints.
  Model `limit_rpm` and `limit_rpd` are the exception and are ignored.
- A missing or null boolean is false. A missing or null value is inactive.
- `provider_info` fields that the endpoint also carries are ignored; provider-only fields apply to endpoints.
- `model.endpoint` is a nested copy of one endpoint and is ignored.
"""

import argparse
import collections
import csv
import datetime
import gzip
import hashlib
import json
import math
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
SCAN = HERE / 'scan.2026-10-27T23:40:40.374Z.jsonl.gz'

# ORCA provider identity (packages/backend/convex/scans/extraction/providers.ts at 2cdf65fcba).
PROVIDER_OVERRIDES = {
    'sambanova-turbo': 'sambanova',
    'nebius-fast': 'nebius',
    'wandb-legacy': 'wandb',
    'model-run': 'modelrun',
    'amazon-bedrock/claude-on-aws': 'claude-on-aws',
    'anthropic/claude-on-aws': 'claude-on-aws',
    'anthropic/2': 'claude-on-aws',
}

# Far-future deprecation dates are placeholders (docs/openrouter/endpoints.md).
PLACEHOLDER_YEAR = 2090
NEW_DAYS = 30
TOOL_CHOICE_MODES = ('literal_auto', 'literal_none', 'literal_required', 'type_function')


def provider_id(slug):
    prefix = slug.split('/', 1)[0]
    return PROVIDER_OVERRIDES.get(slug) or PROVIDER_OVERRIDES.get(prefix) or prefix


def in_scope(entry):
    model = entry['model']
    return (
        bool(entry['endpoints'])
        and not entry['model_id'].startswith('google/lyria')
        and 'text' in model['input_modalities']
        and 'text' in model['output_modalities']
    )


def load(path):
    raw = gzip.decompress(path.read_bytes())
    entries = [json.loads(line) for line in raw.decode().splitlines() if line]
    return raw, entries


def text(value):
    return value.strip() if isinstance(value, str) and value.strip() else None


def parse_time(value):
    return datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))


class Row:
    """One endpoint with its model, provider identity, and model siblings."""

    def __init__(self, entry, endpoint, siblings, scan_at):
        self.entry = entry
        self.model = entry['model']
        self.ep = endpoint
        self.siblings = siblings
        self.scan_at = scan_at
        self.provider = provider_id(endpoint['provider_info']['slug'])
        self.pinfo = endpoint['provider_info']
        self.rc = self.model.get('reasoning_config') or {}
        self.features = endpoint.get('features') or {}
        self.params = set(endpoint['supported_parameters'])
        self.excluded = set(endpoint['excluded_parameters'])
        self.passthrough = set(endpoint['allowed_passthrough_parameters'])
        self.pricing = endpoint['pricing']
        self.pricing_json = endpoint.get('pricing_json') or {}


def deprecation(row):
    dates = [d for d in (row.ep.get('deprecation_date'), row.model.get('variant_deprecation_date')) if d]
    real = [d for d in dates if parse_time(d).year < PLACEHOLDER_YEAR]
    return min(real)[:10] if real else None


def reasoning(row):
    return row.ep['supports_reasoning'] or row.model['supports_reasoning']


def mandatory_reasoning(row):
    return row.features.get('is_mandatory_reasoning') is True or row.rc.get('is_mandatory_reasoning') is True


def efforts(row):
    levels = row.rc.get('supported_reasoning_efforts') or []
    return ' '.join(levels) if levels else None


def return_mechanism(row):
    return row.features.get('reasoning_return_mechanism') or row.rc.get('reasoning_return_mechanism')


def tool_choice(row):
    modes = row.features.get('supports_tool_choice') or {}
    return tuple(mode for mode in TOOL_CHOICE_MODES if modes.get(mode))


def reduced_context(row):
    widest = max(s['context_length'] for s in row.siblings)
    return f"{row.ep['context_length']}/{widest}" if row.ep['context_length'] < widest else None


def prompt_cap(row):
    cap = row.ep.get('max_prompt_tokens')
    return cap if cap and cap < row.ep['context_length'] else None


def retention_days(row):
    policy = row.ep['data_policy']
    if not policy['retainsPrompts']:
        return None
    return policy.get('retentionDays') or 'unstated'


def recent(timestamp, row):
    return (row.scan_at - parse_time(timestamp)).days < NEW_DAYS


def long_context_pricing(row):
    keys = [k for k in row.pricing_json if 'long_context' in k or 'high_context' in k or 'tier2' in k]
    overrides = [o for o in row.pricing.get('overrides') or [] if o.get('min_prompt_tokens')]
    return bool(keys or overrides)


def scheduled_pricing(row):
    overrides = [o for o in row.pricing.get('overrides') or [] if 'utc_start' in o]
    windows = [d for d in row.ep['display_pricing'] if d.get('scheduleWindows')]
    return bool(overrides or windows)


# key, group, level, source, resolver. A resolver returns falsy for inactive, True for a flag, else a value.
P = []


def prop(key, group, level, source, fn):
    P.append((key, group, level, source, fn))


for mod in ('image', 'file', 'video', 'audio', 'text'):
    prop(f'input:{mod}', 'modality', 'model', 'model.input_modalities', lambda r, m=mod: m in r.model['input_modalities'])
for mod in ('image', 'audio', 'text'):
    prop(f'output:{mod}', 'modality', 'model', 'model.output_modalities', lambda r, m=mod: m in r.model['output_modalities'])

prop('reasoning', 'reasoning', 'model+endpoint', 'supports_reasoning (either)', reasoning)
prop('reasoning_mandatory', 'reasoning', 'model+endpoint', 'is_mandatory_reasoning (either)', mandatory_reasoning)
prop('reasoning_default_off', 'reasoning', 'model', 'reasoning_config.default_reasoning_enabled false',
     lambda r: reasoning(r) and r.rc.get('default_reasoning_enabled') is False)
prop('reasoning_efforts', 'reasoning', 'model', 'reasoning_config.supported_reasoning_efforts', efforts)
prop('reasoning_default_effort', 'reasoning', 'model', 'reasoning_config.default_reasoning_effort',
     lambda r: r.rc.get('default_reasoning_effort'))
prop('reasoning_max_tokens', 'reasoning', 'model', 'reasoning_config.supports_reasoning_max_tokens',
     lambda r: r.rc.get('supports_reasoning_max_tokens') is True)
prop('reasoning_return', 'reasoning', 'model+endpoint', 'reasoning_return_mechanism', return_mechanism)
prop('reasoning_hidden', 'reasoning', 'model+endpoint', "reasoning_return_mechanism 'none'",
     lambda r: return_mechanism(r) == 'none')
prop('reasoning_disabled_as', 'reasoning', 'endpoint', 'features.reasoning_disabled_as',
     lambda r: r.features.get('reasoning_disabled_as'))

prop('tool_choice_partial', 'tools', 'endpoint', 'tools listed, not all four tool_choice modes',
     lambda r: 'tools' in r.params and len(tool_choice(r)) < 4 and ' '.join(m.split('_', 1)[1] for m in tool_choice(r)) or None)
prop('tool_choice_required', 'tools', 'endpoint', "tools listed with tool_choice 'required'",
     lambda r: 'tools' in r.params and 'literal_required' in tool_choice(r))
prop('native_web_search', 'native tools', 'endpoint', 'features.supports_native_web_search',
     lambda r: r.features.get('supports_native_web_search') is True)
prop('native_web_fetch', 'native tools', 'endpoint', 'features.supports_native_web_fetch',
     lambda r: r.features.get('supports_native_web_fetch') is True)
prop('native_apply_patch', 'native tools', 'endpoint', 'features.supports_native_apply_patch',
     lambda r: r.features.get('supports_native_apply_patch') is True)

for key in ('supports_file_urls', 'supports_base64_file_input', 'supports_image_urls', 'supports_base64_image_input',
            'supports_video_urls', 'supports_base64_video_input', 'supports_input_audio', 'supports_multipart'):
    prop(f'features.{key}', 'input delivery', 'endpoint', f'features.{key}', lambda r, k=key: r.features.get(k) is True)
prop('multipart', 'input delivery', 'endpoint', 'supports_multipart', lambda r: r.ep['supports_multipart'])

prop('completions', 'protocol', 'endpoint', 'has_completions', lambda r: r.ep['has_completions'])
prop('chat_completions', 'protocol', 'endpoint', 'has_chat_completions', lambda r: r.ep['has_chat_completions'])
prop('abortable', 'protocol', 'endpoint', 'can_abort', lambda r: r.ep['can_abort'])
prop('tool_parameters', 'protocol', 'endpoint', 'supports_tool_parameters', lambda r: r.ep['supports_tool_parameters'])
prop('system_merged', 'protocol', 'model', 'features.chat_template_config.should_hoist_and_merge_system_messages',
     lambda r: ((r.model.get('features') or {}).get('chat_template_config') or {}).get('should_hoist_and_merge_system_messages') is True)
prop('default_system', 'protocol', 'model', 'default_system', lambda r: text(r.model.get('default_system')))
prop('reasoning_system_prompt', 'protocol', 'model', 'reasoning_config.system_prompt', lambda r: text(r.rc.get('system_prompt')))
prop('instruct_type', 'protocol', 'model', 'instruct_type', lambda r: r.model.get('instruct_type'))
prop('default_stops', 'protocol', 'model', 'default_stops', lambda r: bool(r.model.get('default_stops')))
prop('default_sampling', 'protocol', 'model', 'default_parameters (non-null keys)',
     lambda r: ' '.join(sorted(k for k, v in (r.model.get('default_parameters') or {}).items() if v is not None)) or None)

prop('zdr', 'data policy', 'endpoint', 'is_zdr', lambda r: r.ep['is_zdr'])
prop('retains_prompts', 'data policy', 'endpoint', 'data_policy.retainsPrompts', lambda r: r.ep['data_policy']['retainsPrompts'])
prop('retention_days', 'data policy', 'endpoint', 'data_policy.retentionDays when retaining', retention_days)
prop('training', 'data policy', 'endpoint', 'data_policy.training', lambda r: r.ep['data_policy']['training'])
prop('training_openrouter', 'data policy', 'endpoint', 'data_policy.trainingOpenRouter', lambda r: r.ep['data_policy']['trainingOpenRouter'])
prop('safety_retention', 'data policy', 'endpoint', 'data_policy.safetyRetention', lambda r: r.ep['data_policy']['safetyRetention'])
prop('requires_user_ids', 'data policy', 'endpoint', 'data_policy.requiresUserIDs', lambda r: r.ep['data_policy'].get('requiresUserIDs') is True)
prop('can_publish', 'data policy', 'endpoint', 'data_policy.canPublish', lambda r: r.ep['data_policy']['canPublish'])
prop('moderated', 'data policy', 'endpoint', 'moderation_required', lambda r: r.ep['moderation_required'])

# Model limit_rpm/limit_rpd are ignored: their rare nonzero values do not describe endpoint limits.
prop('limit_rpm', 'limits', 'endpoint', 'limit_rpm', lambda r: r.ep.get('limit_rpm'))
prop('limit_rpd', 'limits', 'endpoint', 'limit_rpd', lambda r: r.ep.get('limit_rpd'))
prop('capacity_tpm', 'limits', 'endpoint', 'capacity_tpm', lambda r: r.ep.get('capacity_tpm'))
prop('prompt_cap', 'limits', 'endpoint', 'max_prompt_tokens below context_length', prompt_cap)
prop('max_tokens_per_image', 'limits', 'endpoint', 'max_tokens_per_image', lambda r: r.ep.get('max_tokens_per_image'))
prop('output_cap_unstated', 'limits', 'endpoint', 'max_completion_tokens null', lambda r: r.ep.get('max_completion_tokens') is None)
prop('reduced_context', 'limits', 'derived', 'context_length below the widest sibling endpoint', reduced_context)

prop('variant_free', 'commercial', 'model', "variant 'free'", lambda r: r.entry['variant'] == 'free')
prop('variant_batch', 'commercial', 'model', "variant 'batch'", lambda r: r.entry['variant'] == 'batch')
prop('is_free', 'commercial', 'endpoint', 'is_free', lambda r: r.ep['is_free'])
prop('byok_only', 'commercial', 'endpoint', 'is_byok_only', lambda r: r.ep['is_byok_only'])
prop('is_byok', 'commercial', 'endpoint', 'is_byok', lambda r: r.ep['is_byok'])
prop('free_limits_disabled', 'commercial', 'endpoint', 'features.disable_free_endpoint_limits',
     lambda r: r.features.get('disable_free_endpoint_limits') is True)

prop('deranked', 'status', 'endpoint', 'is_deranked', lambda r: r.ep['is_deranked'])
prop('disabled', 'status', 'endpoint', 'is_disabled', lambda r: r.ep['is_disabled'])
prop('status_nonzero', 'status', 'endpoint', 'status other than 0', lambda r: r.ep['status'] or None)
prop('deprecating', 'status', 'model+endpoint', 'deprecation_date or variant_deprecation_date, placeholders excluded', deprecation)
prop('deprecation_placeholder', 'status', 'model+endpoint', 'deprecation date after 2090',
     lambda r: any(d and parse_time(d).year >= PLACEHOLDER_YEAR for d in (r.ep.get('deprecation_date'), r.model.get('variant_deprecation_date'))))
prop('new_endpoint', 'status', 'derived', f'endpoint created_at within {NEW_DAYS} days', lambda r: recent(r.ep['created_at'], r))
prop('new_model', 'status', 'derived', f'model created_at within {NEW_DAYS} days', lambda r: recent(r.model['created_at'], r))
prop('warning_message', 'status', 'model', 'warning_message', lambda r: text(r.model.get('warning_message')))
prop('routing_error_message', 'status', 'model', 'routing_error_message', lambda r: text(r.model.get('routing_error_message')))
for key in ('is_hidden', 'is_private', 'is_hipaa_eligible', 'is_pricing_unresolved'):
    prop(key, 'status', 'endpoint', key, lambda r, k=key: r.ep[k])

prop('quantization', 'facet', 'endpoint', "quantization other than 'unknown'", lambda r: r.ep['quantization'] if r.ep['quantization'] != 'unknown' else None)
prop('region', 'facet', 'endpoint', 'provider_region', lambda r: r.ep.get('provider_region'))
prop('service_tier', 'facet', 'endpoint', 'service_tier', lambda r: r.ep.get('service_tier'))
prop('derived_service_tier', 'facet', 'endpoint', 'derived_service_tier', lambda r: r.ep.get('derived_service_tier'))

prop('open_weights', 'model facts', 'model', 'hf_slug present', lambda r: text(r.model.get('hf_slug')) is not None)
prop('knowledge_cutoff', 'model facts', 'model', 'knowledge_cutoff', lambda r: (r.model.get('knowledge_cutoff') or '')[:7] or None)
prop('trainable_text', 'model facts', 'model', 'is_trainable_text', lambda r: r.model.get('is_trainable_text') is True)
prop('version_group', 'model facts', 'model', 'model_version_group_id', lambda r: bool(r.model.get('model_version_group_id')))

prop('headquarters', 'provider', 'provider', 'provider_info.headquarters', lambda r: r.pinfo.get('headquarters'))
prop('datacenters', 'provider', 'provider', 'provider_info.datacenters', lambda r: ' '.join(r.pinfo.get('datacenters') or []) or None)
prop('byok_enabled', 'provider', 'provider', 'provider_info.byokEnabled', lambda r: r.pinfo['byokEnabled'])
prop('status_page', 'provider', 'provider', 'provider_info.statusPageUrl', lambda r: bool(r.pinfo.get('statusPageUrl')))
prop('send_client_ip', 'provider', 'provider', 'provider_info.sendClientIp', lambda r: r.pinfo['sendClientIp'])
prop('attestation', 'provider', 'provider', 'provider_info.requiredAttestationTypes', lambda r: ' '.join(r.pinfo['requiredAttestationTypes']) or None)

prop('caching', 'pricing-derived', 'endpoint', 'pricing.input_cache_read', lambda r: 'input_cache_read' in r.pricing)
prop('cache_write', 'pricing-derived', 'endpoint', 'pricing.input_cache_write', lambda r: 'input_cache_write' in r.pricing)
prop('cache_write_1h', 'pricing-derived', 'endpoint', 'pricing.input_cache_write_1h', lambda r: 'input_cache_write_1h' in r.pricing)
prop('web_search_price', 'pricing-derived', 'endpoint', 'pricing.web_search', lambda r: 'web_search' in r.pricing)
prop('long_context_pricing', 'pricing-derived', 'endpoint', 'long/high-context or tiered meters, or min_prompt_tokens overrides', long_context_pricing)
prop('scheduled_pricing', 'pricing-derived', 'endpoint', 'utc_start overrides or scheduleWindows', scheduled_pricing)
prop('discounted', 'pricing-derived', 'endpoint', 'pricing.discount above 0', lambda r: r.pricing['discount'] if r.pricing.get('discount', 0) > 0 else None)
prop('reasoning_price', 'pricing-derived', 'endpoint', 'pricing.internal_reasoning', lambda r: 'internal_reasoning' in r.pricing)


def add_set_members(rows):
    params = sorted({p for r in rows for p in r.params})
    for p in params:
        prop(f'param:{p}', 'parameter', 'endpoint', 'supported_parameters', lambda r, p=p: p in r.params)
    for p in sorted({p for r in rows for p in r.excluded}):
        prop(f'excluded:{p}', 'excluded parameter', 'endpoint', 'excluded_parameters', lambda r, p=p: p in r.excluded)
    for p in sorted({p for r in rows for p in r.passthrough}):
        prop(f'passthrough:{p}', 'passthrough parameter', 'endpoint', 'allowed_passthrough_parameters', lambda r, p=p: p in r.passthrough)
    for e in sorted({e for r in rows for e in (r.rc.get('supported_reasoning_efforts') or [])}):
        prop(f'effort:{e}', 'reasoning', 'model', 'reasoning_config.supported_reasoning_efforts',
             lambda r, e=e: e in (r.rc.get('supported_reasoning_efforts') or []))


def resolve(row, fn):
    value = fn(row)
    return None if value is False or value is None or value == '' else value


def entropy(active, total):
    if active in (0, total):
        return 0.0
    p = active / total
    return -(p * math.log2(p) + (1 - p) * math.log2(1 - p))


def properties(rows):
    by_model = collections.defaultdict(list)
    for r in rows:
        by_model[r.entry['model_id']].append(r)
    multi = {m: rs for m, rs in by_model.items() if len(rs) > 1}
    out = []
    for key, group, level, source, fn in P:
        values = [resolve(r, fn) for r in rows]
        active = [(r, v) for r, v in zip(rows, values) if v is not None]
        counts = collections.Counter(str(v)[:48] for _, v in active if v is not True)
        varying = sum(1 for rs in multi.values() if len({str(resolve(r, fn)) for r in rs}) > 1)
        out.append({
            'key': key,
            'group': group,
            'level': level,
            'source': source,
            'endpoints': len(active),
            'share': f'{len(active) / len(rows):.4f}',
            'binary_entropy': f'{entropy(len(active), len(rows)):.3f}',
            'models': len({r.entry['model_id'] for r, _ in active}),
            'providers': len({r.provider for r, _ in active}),
            'models_varying': varying,
            'distinct_values': len(counts),
            'top_values': '; '.join(f'{v} {n}' for v, n in counts.most_common(8)),
        })
    return out, len(multi)


def agreements(rows):
    checks = {
        'supports_reasoning endpoint|model': lambda r: (r.ep['supports_reasoning'], r.model['supports_reasoning']),
        'is_mandatory_reasoning endpoint features|model reasoning_config': lambda r: (r.features.get('is_mandatory_reasoning'), r.rc.get('is_mandatory_reasoning')),
        'reasoning param|supports_reasoning': lambda r: ('reasoning' in r.params, r.ep['supports_reasoning']),
        'limit_rpm endpoint|model': lambda r: (r.ep.get('limit_rpm'), r.model.get('limit_rpm')),
        'limit_rpd endpoint|model': lambda r: (r.ep.get('limit_rpd'), r.model.get('limit_rpd')),
        'context_length endpoint equals model': lambda r: (r.ep['context_length'] == r.model['context_length'],),
        'is_free|variant free': lambda r: (r.ep['is_free'], r.entry['variant'] == 'free'),
        'is_zdr|retainsPrompts': lambda r: (r.ep['is_zdr'], r.ep['data_policy']['retainsPrompts']),
        'is_zdr|zdr in provider tag': lambda r: (r.ep['is_zdr'], 'zdr' in r.ep['provider_slug'].split('/')),
        'tools param|supports_tool_parameters': lambda r: ('tools' in r.params, r.ep['supports_tool_parameters']),
        'features.supported_parameters.structured_outputs|param': lambda r: (((r.features.get('supported_parameters') or {}).get('structured_outputs')), 'structured_outputs' in r.params),
        'features.supported_parameters.response_format|param': lambda r: (((r.features.get('supported_parameters') or {}).get('response_format')), 'response_format' in r.params),
        'native_web_search|web_search price': lambda r: (r.features.get('supports_native_web_search'), 'web_search' in r.pricing),
        'status|is_deranked': lambda r: (r.ep['status'], r.ep['is_deranked']),
        'status|is_byok_only': lambda r: (r.ep['status'], r.ep['is_byok_only']),
        'excluded temperature|temperature param': lambda r: ('temperature' in r.excluded, 'temperature' in r.params),
        'provider isAbortable|can_abort': lambda r: (r.pinfo['isAbortable'], r.ep['can_abort']),
        'provider moderationRequired|moderation_required': lambda r: (r.pinfo['moderationRequired'], r.ep['moderation_required']),
        'provider hasCompletions|has_completions': lambda r: (r.pinfo['hasCompletions'], r.ep['has_completions']),
        'provider dataPolicy.training|data_policy.training': lambda r: (r.pinfo['dataPolicy']['training'], r.ep['data_policy']['training']),
        'provider dataPolicy.retainsPrompts|data_policy.retainsPrompts': lambda r: (r.pinfo['dataPolicy']['retainsPrompts'], r.ep['data_policy']['retainsPrompts']),
        'provider dataPolicy.requiresUserIDs|data_policy.requiresUserIDs': lambda r: (r.pinfo['dataPolicy'].get('requiresUserIDs'), r.ep['data_policy'].get('requiresUserIDs')),
    }
    out = []
    for check, fn in checks.items():
        for values, n in sorted(collections.Counter(fn(r) for r in rows).items(), key=lambda kv: -kv[1]):
            out.append({'check': check, 'values': '|'.join('' if v is None else str(v) for v in values), 'endpoints': n})
    return out


# Field dispositions, first matching prefix wins. Paths use `[]` for list items; a prefix ending in `.`
# covers descendants only. `property` fields feed properties.csv; `dimension` fields are numeric
# columns from which properties.csv derives only exceptional states.
E = '$.endpoints[].'
DISPOSITIONS = [
    (E + 'model.', 'nested copy'),
    (E + 'stats', 'stats'),
    (E + 'statsByTier', 'stats'),
    (E + 'pricing', 'pricing'),
    (E + 'display_pricing', 'pricing'),
    (E + 'server_tool_costs_discount_exempt', 'pricing'),
    (E + 'image_token_mirrors_output_rate', 'pricing'),
    *[(E + f'provider_info.{k}', 'provider duplicate') for k in (
        'dataPolicy', 'isAbortable', 'moderationRequired', 'hasChatCompletions', 'hasCompletions', 'isPrivate', 'adapterName')],
    *[(E + f'provider_info.{k}', 'identity') for k in ('slug', 'name', 'displayName', 'icon')],
    (E + 'provider_info.baseUrl', 'internal'),
    (E + 'provider_info.pricingStrategy', 'internal'),
    (E + 'provider_info.', 'property'),
    (E + 'provider_info', 'container'),
    (E + 'adapter_name', 'internal'),
    (E + 'features.should_send_reasoning_text_in_text_content', 'internal'),
    (E + 'declared_region', 'constant'),
    (E + 'data_policy.privacyPolicyURL', 'link'),
    (E + 'data_policy.termsOfServiceURL', 'link'),
    *[(E + k, 'modality detail') for k in (
        'supported_image_parameters', 'supported_video_parameters', 'supported_stt_parameters',
        'features.max_choice_options', 'features.max_score_levels', 'features.supports_image_reference',
        'features.supports_voice_cloning', 'features.supports_multiple_audio_references')],
    (E + 'features.supported_parameters', 'duplicate'),
    *[(E + k, 'dimension') for k in ('context_length', 'max_completion_tokens', 'max_prompt_tokens')],
    *[(E + k, 'identity') for k in (
        'id', 'name', 'model_variant_slug', 'model_variant_permaslug', 'variant', 'provider_name', 'provider_slug',
        'provider_display_name', 'provider_permaslug', 'provider_model_id', 'pricing_version_id')],
    *[(E + k, 'container') for k in ('data_policy', 'features', 'features.supports_tool_choice')],
    (E, 'property'),
    ('$.endpoints[]', 'container'),
    ('$.model.features.reasoning_config', 'duplicate'),
    ('$.model.has_text_output', 'duplicate'),
    ('$.model.context_length', 'duplicate'),
    ('$.model.reasoning_config.start_token', 'internal'),
    ('$.model.reasoning_config.end_token', 'internal'),
    ('$.model.default_order', 'internal'),
    ('$.model.updated_at', 'internal'),
    *[('$.model.' + k, 'constant') for k in (
        'router', 'hf_updated_at', 'is_trainable_image', 'hidden', 'is_private', 'required_attestation_types',
        'display_required_attestation_types')],
    *[('$.model.' + k, 'presentation') for k in (
        'promotion_message', 'quick_start_example_type', 'preview', 'previews_by_modality', 'description',
        'author_icon_uri', 'author_flagship_modalities', 'group')],
    ('$.model.supported_tts_voices', 'modality detail'),
    *[('$.model.' + k, 'identity') for k in ('slug', 'permaslug', 'name', 'short_name', 'author', 'author_display_name')],
    *[('$.model.' + k, 'container') for k in ('features', 'features.chat_template_config', 'reasoning_config', 'default_parameters')],
    ('$.model.', 'property'),
    ('$', 'identity'),
]


def disposition(path):
    for prefix, label in DISPOSITIONS:
        if label == 'container' and path != prefix:
            continue
        if path == prefix or (prefix.endswith('.') and path.startswith(prefix)) or path.startswith(prefix + '.') or path.startswith(prefix + '['):
            return label
    return 'unclassified'


def collapse(path):
    for prefix in ('$.endpoints[].pricing_json.', '$.endpoints[].stats.', '$.endpoints[].statsByTier',
                   '$.endpoints[].display_pricing[].', '$.endpoints[].pricing.display_pricing[].',
                   '$.endpoints[].model.'):
        if path.startswith(prefix):
            return prefix + '*'
    return path


def fields(entries):
    acc = collections.defaultdict(lambda: {'types': collections.Counter(), 'true': 0, 'values': collections.Counter()})

    def walk(value, path):
        path = collapse(path)
        slot = acc[path]
        slot['types'][type(value).__name__] += 1
        if value is True:
            slot['true'] += 1
        if isinstance(value, (str, int, float, bool)) and not path.endswith('*'):
            slot['values'][str(value)[:60]] += 1
        if isinstance(value, dict):
            for k, v in value.items():
                walk(v, f'{path}.{k}')
        elif isinstance(value, list):
            for v in value:
                walk(v, f'{path}[]')

    for entry in entries:
        walk({k: v for k, v in entry.items() if k != 'endpoints'}, '$')
        for endpoint in entry['endpoints']:
            walk(endpoint, '$.endpoints[]')
    out = []
    for path in sorted(acc):
        slot = acc[path]
        out.append({
            'path': path,
            'disposition': disposition(path),
            'occurrences': sum(slot['types'].values()),
            'types': ' '.join(f'{t}:{n}' for t, n in slot['types'].most_common()),
            'true': slot['true'],
            'distinct': len(slot['values']),
            'top_values': '; '.join(f'{v} {n}' for v, n in slot['values'].most_common(4)) if len(slot['values']) <= 40 else '',
        })
    return out


def cell(value):
    if isinstance(value, list):
        return ' '.join(value)
    return '' if value is None else str(value).lower() if isinstance(value, bool) else str(value)


def provider_facts(rows):
    keys = ('headquarters', 'datacenters', 'byokEnabled', 'statusPageUrl', 'sendClientIp', 'requiredAttestationTypes', 'pricingStrategy')
    groups = collections.defaultdict(list)
    for r in rows:
        groups[r.provider].append(r)
    out = []
    for provider, rs in sorted(groups.items()):
        row = {'provider': provider, 'endpoints': len(rs), 'tags': len({r.ep['provider_slug'] for r in rs})}
        for key in keys:
            seen = collections.Counter(cell(r.pinfo.get(key)) for r in rs)
            row[key] = ' | '.join(v for v, _ in seen.most_common())
        out.append(row)
    return out


def write(path, rows):
    with path.open('w', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]), lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--scan', type=pathlib.Path, default=SCAN)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    raw, entries = load(args.scan)
    scan_at = parse_time(entries[0]['scan_at'])
    scoped = [e for e in entries if in_scope(e)]
    rows = [Row(e, ep, e['endpoints'], scan_at) for e in scoped for ep in e['endpoints']]
    add_set_members(rows)

    props, multi_models = properties(rows)
    write(args.output / 'properties.csv', props)
    write(args.output / 'agreements.csv', agreements(rows))
    write(args.output / 'fields.csv', fields(scoped))
    write(args.output / 'providers.csv', provider_facts(rows))
    write(args.output / 'population.csv', [
        {'measure': 'scan_at', 'value': entries[0]['scan_at']},
        {'measure': 'scan_sha256', 'value': hashlib.sha256(raw).hexdigest()},
        {'measure': 'collected_models', 'value': len(entries)},
        {'measure': 'collected_models_with_endpoints', 'value': sum(1 for e in entries if e['endpoints'])},
        {'measure': 'collected_endpoints', 'value': sum(len(e['endpoints'] or []) for e in entries)},
        {'measure': 'scoped_models', 'value': len(scoped)},
        {'measure': 'scoped_endpoints', 'value': len(rows)},
        {'measure': 'scoped_providers', 'value': len({r.provider for r in rows})},
        {'measure': 'scoped_provider_tags', 'value': len({r.ep['provider_slug'] for r in rows})},
        {'measure': 'models_with_multiple_endpoints', 'value': multi_models},
        {'measure': 'endpoints_in_multi_endpoint_models', 'value': sum(len(e['endpoints']) for e in scoped if len(e['endpoints']) > 1)},
    ])


if __name__ == '__main__':
    main()
