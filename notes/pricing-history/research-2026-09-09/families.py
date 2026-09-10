"""Test family-based pricing hypotheses using the established second-pass event rules.

Cohorts are assigned independently of observed activity. These are market-family tags, not licenses.
Importing analyze regenerates the base study first. Run plot_families.py afterwards.
"""
from collections import Counter, defaultdict
from decimal import Decimal
import json
from statistics import median

from analyze import (ROOT, asof, DAY, endpoints, models, model_ids, current, intervals, events,
                     normalized, identity, stamp, iso, write, state, summary, segments)

HOSTED = {'x-ai', 'amazon', 'perplexity', 'writer', 'inception', 'morph', 'relace'}
OPEN_FAMILIES = {'nvidia', 'microsoft', 'ibm-granite', 'cohere', 'thinkingmachines', 'poolside', 'rekaai'}
FOCUS = {'deepseek': 'DeepSeek', 'z-ai': 'GLM', 'moonshotai': 'Kimi', 'qwen': 'Qwen'}


def tags(mid):
    author, slug = mid.split('/', 1)
    if author == 'openai' and slug.startswith('gpt-oss'):
        return 'open_weight_families', 'GPT-OSS', 'Explicit user exception to the OpenAI proprietary grouping'
    if author == 'google' and slug.startswith('gemma'):
        return 'open_weight_families', 'Gemma', 'Explicit user exception to the Google proprietary grouping'
    if author == 'anthropic' and slug.startswith('claude'):
        return 'major_labs', 'Claude', 'User-defined major-lab cohort'
    if author == 'openai':
        return 'major_labs', 'OpenAI proprietary', 'Includes GPT, o-series, audio/image and batch IDs; excludes GPT-OSS'
    if author == 'google' and slug.startswith('gemini'):
        return 'major_labs', 'Gemini', 'User-defined major-lab cohort; excludes Gemma and Lyria'
    if author in FOCUS:
        return 'deepseek_glm_kimi_qwen', FOCUS[author], 'Named comparison families; do not assume every model is open-weight'
    if author in ('meta', 'meta-llama'):
        return 'meta_mistral', 'Meta', 'Mixed family; do not infer license or serving model from author alone'
    if author == 'mistralai':
        return 'meta_mistral', 'Mistral', 'Mixed family; do not infer license or serving model from author alone'
    if author in HOSTED:
        return 'other_hosted_candidates', author, 'Explicit candidate family, classified before inspecting change counts; not a license assertion'
    if author in OPEN_FAMILIES:
        return 'open_weight_families', author, 'Family containing open-weight models; per-model catalog evidence is retained separately'
    return 'misc', author, 'No stronger cohort assignment made'


assert tags('openai/gpt-oss-120b:batch')[:2] == ('open_weight_families', 'GPT-OSS')
assert tags('google/gemma-4-31b-it:free')[:2] == ('open_weight_families', 'Gemma')
assert tags('openai/o3')[0] == 'major_labs'
assert tags('google/gemini-3.8-flash:batch')[0] == 'major_labs'
assert tags('meta/muse-spark-1.3')[0] == 'meta_mistral'


def covered_days(ids, days):
    start, end = asof-days*DAY, asof
    spells = sorted((max(a,start), min(b,end)) for eid in ids for a,b in intervals[eid] if a<end and b>start)
    total, last_end = 0, start
    for a,b in spells:
        total += max(0,b-max(a,last_end))
        last_end = max(last_end,b)
    return total/DAY


current_models = {endpoints[eid]['model_id'] for eid in current}
by_model = defaultdict(list)
by_endpoint = defaultdict(list)
model_segments = defaultdict(list)
for r in segments:
    model_segments[r['model_id']].append(r)
for e in events:
    by_model[e['model_id']].append(e)
    by_endpoint[e['endpoint_id']].append(e)
model_rows, endpoint_rows = [], []
for mid in sorted(current_models):
    model = models[mid]
    ids = model_ids[mid]
    active = sorted(set(ids)&current)
    cohort, family, basis = tags(mid)
    description = model['metadata'].get('description', '')
    low = description.lower()
    evidence = 'description mentions open-weight/source; inspect context' if any(s in low for s in ['open-weight', 'open weight', 'open-source', 'open source']) else 'Hugging Face slug only; not proof of license' if model['metadata'].get('hf_slug') else 'no open-weight evidence recorded here'
    prices = [normalized(endpoints[eid]['pricing']['meters']) for eid in active]
    prompt_levels = {p['prompt'] for p in prices if 'prompt' in p}
    row = {'model_id': mid, 'name': model['display_name'], 'cohort': cohort, 'family': family, 'tag_basis': basis,
           'variant': model['variant'], 'catalog_weight_evidence': evidence, 'hf_slug': model['metadata'].get('hf_slug'),
           'current_endpoints': len(active), 'current_tags': len({endpoints[eid]['provider_tag'] for eid in active}),
           'current_organizations': len({identity(eid)['organization'] for eid in active}),
           'current_prompt_levels': len(prompt_levels), 'current_prompt_metered_endpoints': sum('prompt' in p for p in prices),
           'current_low_prompt': min(prompt_levels) if prompt_levels else '', 'current_high_prompt': max(prompt_levels) if prompt_levels else '',
           'observed_age_days': (asof-min(a for eid in ids for a,b in intervals[eid]))/DAY,
           'upstream_age_days': (asof-stamp(model['or_created_at']))/DAY}
    for days in (7,30,90):
        es = [e for e in by_model[mid] if stamp(e['scan_at'])>=asof-days*DAY]
        counted = [e for e in es if e['class']=='counted']
        spans = [r for r in model_segments[mid] if stamp(r['end'])>asof-days*DAY and stamp(r['start'])<asof]
        levels = {r['prompt'] for r in spans if r['prompt'] != ''}
        row.update({f'covered_days_{days}d': covered_days(ids, days), f'full_window_{days}d': covered_days(ids, days)>=days-1e-6,
                    f'window_prompt_levels_{days}d': len(levels), f'has_scheduled_span_{days}d': any(r['scheduled'] for r in spans),
                    f'all_meter_changes_{days}d': len(counted), f'input_changes_{days}d': sum('prompt' in e['changed_meters'].split(';') for e in counted),
                    f'core_changes_{days}d': sum(e['core_change'] for e in counted),
                    f'changed_endpoints_{days}d': len({e['endpoint_id'] for e in counted}),
                    f'active_endpoints_{days}d': sum(covered_days([eid],days)>0 for eid in ids),
                    f'listed_endpoint_days_{days}d': sum(covered_days([eid],days) for eid in ids),
                    f'initial_endpoints_{days}d': sum(e['class']=='initial' for e in es),
                    f'scheduled_excluded_{days}d': sum(e['class']=='scheduled_excluded' for e in es)})
    model_rows.append(row)
    for eid in active:
        e = endpoints[eid]
        er = {**identity(eid), 'cohort': cohort, 'family': family, 'variant': e['variant'],
              'prompt': normalized(e['pricing']['meters']).get('prompt','')}
        for days in (30,90):
            es = [r for r in by_endpoint[eid] if r['class']=='counted' and stamp(r['scan_at'])>=asof-days*DAY]
            er.update({f'all_meter_changes_{days}d': len(es), f'input_changes_{days}d': sum('prompt' in r['changed_meters'].split(';') for r in es),
                       f'listed_days_{days}d': covered_days([eid],days)})
        endpoint_rows.append(er)
write('model_family_activity',model_rows)
write('current_endpoint_families',endpoint_rows)


def aggregate(label, rs):
    eps = [e for e in endpoint_rows if e['model_id'] in {r['model_id'] for r in rs}]
    out = {'group':label, 'current_models':len(rs), 'model_percent':100*len(rs)/len(model_rows),
           'current_endpoints':len(eps), 'endpoint_percent':100*len(eps)/len(endpoint_rows),
           'standard_model_ids':sum(r['variant']=='standard' for r in rs),
           'at_most_two_current_prompt_levels':sum(0<r['current_prompt_levels']<=2 for r in rs),
           'median_current_prompt_levels':median(r['current_prompt_levels'] for r in rs),
           'median_current_tags':median(r['current_tags'] for r in rs)}
    for days in (7,30,90):
        mature = [r for r in rs if r[f'full_window_{days}d']]
        total = sum(r[f'all_meter_changes_{days}d'] for r in model_rows)
        exposure = sum(r[f'listed_endpoint_days_{days}d'] for r in rs)
        out.update({f'all_meter_changes_{days}d':sum(r[f'all_meter_changes_{days}d'] for r in rs),
                    f'change_share_{days}d':100*sum(r[f'all_meter_changes_{days}d'] for r in rs)/total if total else 0,
                    f'input_changes_{days}d':sum(r[f'input_changes_{days}d'] for r in rs),
                    f'core_changes_{days}d':sum(r[f'core_changes_{days}d'] for r in rs),
                    f'zero_all_meter_models_{days}d':sum(r[f'all_meter_changes_{days}d']==0 for r in rs),
                    f'zero_input_models_{days}d':sum(r[f'input_changes_{days}d']==0 for r in rs),
                    f'full_window_models_{days}d':len(mature),
                    f'full_window_zero_all_meter_models_{days}d':sum(r[f'all_meter_changes_{days}d']==0 for r in mature),
                    f'full_window_zero_input_models_{days}d':sum(r[f'input_changes_{days}d']==0 for r in mature),
                    f'full_window_flat_two_level_models_{days}d':sum(r[f'input_changes_{days}d']==0 and not r[f'has_scheduled_span_{days}d'] and 0<r[f'window_prompt_levels_{days}d']<=2 for r in mature),
                    f'changes_per_100_endpoint_days_{days}d':100*sum(r[f'all_meter_changes_{days}d'] for r in rs)/exposure if exposure else ''})
        if days in (30,90):
            out[f'zero_all_meter_current_endpoints_{days}d'] = sum(e[f'all_meter_changes_{days}d']==0 for e in eps)
    return out


cohorts = [aggregate(c,[r for r in model_rows if r['cohort']==c]) for c in sorted({r['cohort'] for r in model_rows})]
families = [aggregate(f,[r for r in model_rows if r['family']==f]) for f in sorted({r['family'] for r in model_rows})]
write('cohort_activity',cohorts)
write('family_activity',families)
# Histogram preserves the spread: a cohort's total should not stand in for each model.
hist = []
for cohort in sorted({r['cohort'] for r in model_rows}):
    for days in (30,90):
        for metric in ('input_changes','all_meter_changes'):
            rs = [r for r in model_rows if r['cohort']==cohort]
            for lo,hi,label in [(0,0,'0'),(1,2,'1–2'),(3,9,'3–9'),(10,49,'10–49'),(50,999999,'50+')]:
                hist.append({'cohort':cohort,'days':days,'metric':metric,'bin':label,'models':sum(lo<=r[f'{metric}_{days}d']<=hi for r in rs)})
write('family_change_distribution',hist)
# Join evidence for any activity in the major-lab cohort, rather than assuming it is flat.
major_ids = {r['model_id'] for r in model_rows if r['cohort']=='major_labs'}
major_events = [{**e,'family':tags(e['model_id'])[1]} for e in events if e['model_id'] in major_ids and e['class']=='counted' and stamp(e['scan_at'])>=asof-90*DAY]
write('major_lab_change_events',major_events)
provider_counts = Counter((e['family'], e['organization']) for e in endpoint_rows if e['cohort']=='major_labs')
write('major_lab_provider_counts', ({'family':family,'organization':org,'current_endpoints':n} for (family,org),n in sorted(provider_counts.items())))
assert len(model_rows)==summary['current_models']
assert len(endpoint_rows)==summary['current_endpoints']
assert sum(r['current_models'] for r in cohorts)==len(model_rows)
assert sum(r['current_endpoints'] for r in cohorts)==len(endpoint_rows)
assert sum(r['all_meter_changes_30d'] for r in cohorts)==sum(e['class']=='counted' and e['model_id'] in current_models and stamp(e['scan_at'])>=asof-30*DAY for e in events)
result = {'clock':iso(asof),'all_current':aggregate('all',model_rows),'major_labs':next(r for r in cohorts if r['group']=='major_labs'),
          'major_plus_hosted_candidates':aggregate('major_plus_hosted_candidates',[r for r in model_rows if r['cohort'] in ('major_labs','other_hosted_candidates')]),
          'standard_only':aggregate('standard_only',[r for r in model_rows if r['variant']=='standard']),
          'major_standard_only':aggregate('major_standard_only',[r for r in model_rows if r['variant']=='standard' and r['cohort']=='major_labs'])}
(ROOT/'family_summary.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
