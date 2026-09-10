"""Second-pass research. Domain rules and denominators are documented in methods.md.

Run with Python's standard library. Source JSONL is immutable evidence; all CSVs are rebuilt.
"""
from bisect import bisect_right
from collections import Counter, defaultdict
import csv
from datetime import datetime, timedelta, timezone
from decimal import Decimal, getcontext
import hashlib
import json
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'data'
DAY = 86400
CORE = ('prompt', 'completion', 'input_cache_read')
EXCLUDED = {'google/lyria-3-clip-preview', 'google/lyria-3-pro-preview'}
getcontext().prec = 100


def load(name):
    return [json.loads(line) for line in (ROOT / 'raw' / f'{name}.jsonl').open()]


def stamp(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()


def iso(value):
    return datetime.fromtimestamp(value, timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def normalized(meters):
    # Domain fact supplied by Dean: absent and zero both mean unmetered.
    result = {k: Decimal(v) for k, v in meters.items() if Decimal(v) != 0}
    assert all(v.is_finite() and v > 0 for v in result.values()), result
    return result


def scheduled(row):
    return any(isinstance(obj, dict) and any(k.startswith('utc_') for k in obj)
               for obj in (row.get('overrides') or []))


def drift(a, b, key):
    if not all(k in x for x in (a, b) for k in ('prompt', key)):
        return None
    return abs(b[key] * a['prompt'] - a[key] * b['prompt']) / (a[key] * b['prompt'])


def write(name, rows):
    rows = list(rows)
    assert rows, name
    with (OUT / f'{name}.csv').open('w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(dict.fromkeys(k for r in rows for k in r)))
        w.writeheader()
        w.writerows(rows)


def stats(values):
    v = sorted(values)
    return {'n': len(v), 'min': min(v), 'median': median(v), 'p95': v[int((len(v)-1)*.95)], 'max': max(v)} if v else {}


def self_check():
    assert normalized({'prompt': '0', 'completion': '0.00'}) == normalized({})
    assert normalized({'prompt': '0.010'}) == normalized({'prompt': '0.01'})
    assert scheduled({'overrides': [{'utc_days': [1]}]})
    assert scheduled({'overrides': [{'utc_future_unknown': 1}]})
    assert not scheduled({'overrides': [{'min_prompt_tokens': 100}]})
    assert drift(normalized({'prompt': '.3', 'completion': '.9'}), normalized({'prompt': '.2', 'completion': '.6'}), 'completion') == 0
    assert drift({}, {'prompt': Decimal(1), 'completion': Decimal(2)}, 'completion') is None


self_check()
manifest = json.loads((ROOT / 'manifest.json').read_text())
asof = stamp(manifest['clock'])
raw_endpoints = load('endpoints')
endpoints = {r['endpoint_id']: r for r in raw_endpoints if r['model_id'] not in EXCLUDED}
models = {r['model_id']: r for r in load('models') if r['model_id'] not in EXCLUDED}
providers = {r['provider_id']: r for r in load('providers')}
pricing = sorted((r for r in load('pricing') if r['endpoint_id'] in endpoints), key=lambda r: (r['endpoint_id'], r['scan_at']))
listings = sorted((r for r in load('listings') if r['endpoint_id'] in endpoints), key=lambda r: (r['endpoint_id'], r['scan_at']))
assert len(raw_endpoints) == manifest['counts']['endpoints']
assert len({(r['endpoint_id'], r['scan_at']) for r in pricing}) == len(pricing)
assert all(stamp(r['scan_at']) <= asof for r in pricing + listings)
begin = min(stamp(r['scan_at']) for r in listings)
by_price, by_listing, intervals = defaultdict(list), defaultdict(list), defaultdict(list)
for r in pricing:
    r['_meters'] = normalized(r['meters'])
    by_price[r['endpoint_id']].append(r)
for r in listings:
    by_listing[r['endpoint_id']].append(r)
for eid, rs in by_listing.items():
    assert rs[0]['state'] == 'listed'
    assert all(a['state'] != b['state'] for a, b in zip(rs, rs[1:]))
    for i, r in enumerate(rs):
        if r['state'] == 'listed':
            intervals[eid].append((stamp(r['scan_at']), stamp(rs[i+1]['scan_at']) if i+1 < len(rs) else asof))
    assert (rs[-1]['state'] == 'listed') == ('unlisted_at' not in endpoints[eid])
price_times = {eid: [stamp(r['scan_at']) for r in rs] for eid, rs in by_price.items()}
listing_times = {eid: [stamp(r['scan_at']) for r in rs] for eid, rs in by_listing.items()}
current = {eid for eid, e in endpoints.items() if 'unlisted_at' not in e}
model_ids = defaultdict(list)
for eid, e in endpoints.items():
    model_ids[e['model_id']].append(eid)
deep_models = {mid for mid, ids in model_ids.items() if any(eid in current or stamp(endpoints[eid]['unlisted_at']) >= asof-60*DAY for eid in ids)}
deep = {eid for eid, e in endpoints.items() if e['model_id'] in deep_models}


def identity(eid):
    e = endpoints[eid]
    return {'model_id': e['model_id'], 'provider_tag': e['provider_tag'], 'organization': e['metadata'].get('provider_name') or e['provider_display_name'], 'endpoint_id': eid}


def episode(eid, t):
    i = bisect_right(listing_times[eid], t)-1
    return i if i >= 0 and by_listing[eid][i]['state'] == 'listed' else None


def state(eid, t):
    if episode(eid, t) is None:
        return None
    i = bisect_right(price_times[eid], t)-1
    assert i >= 0
    return by_price[eid][i]


def exposure(eid, a=begin, b=asof):
    return sum(max(0, min(y, b)-max(x, a)) for x, y in intervals[eid]) / DAY


def reporting_reason(eid, r, prev, changed):
    """Narrow reviewed patterns, not a blanket January exclusion; see reporting.md."""
    day = r['scan_at'][:10]
    org = identity(eid)['organization']
    a, b = prev['_meters'], r['_meters']
    if day == '2026-01-14' and org == 'OpenAI' and 'request' in a and a.get('request') == b.get('web_search') and 'request' not in b:
        return 'search_charge_field_reassignment'
    if day in ('2026-01-22', '2026-01-23') and org in ('Google', 'Google AI Studio') and changed & {'image', 'image_token', 'internal_reasoning', 'input_audio_cache', 'input_cache_write'}:
        return 'google_reporting_rollout_and_corrections'
    # Removal of standalone image quotes during the inspected multi-provider reporting wave.
    if '2026-01-12' <= day <= '2026-01-27' and changed == {'image'} and 'image' in a and 'image' not in b:
        return 'standalone_image_quote_removed_during_rollout'
    return ''


def classify(prev, row, same_episode, reporting=''):
    if prev is None:
        return 'initial'
    if not same_episode:
        return 'relisted'
    # Entry and exit boundaries are excluded too: either side describes scheduled pricing.
    if scheduled(prev) or scheduled(row):
        return 'scheduled_excluded'
    if prev['_meters'] == row['_meters']:
        return 'unmetered_equivalent' if prev['meters'] != row['meters'] else 'metadata_only'
    if reporting:
        return 'reporting_excluded'
    return 'counted'


zero = {'meters': {'prompt': '0'}, '_meters': {}, 'discount': 0}
empty = {'meters': {}, '_meters': {}, 'discount': 0}
assert classify(zero, empty, True) == 'unmetered_equivalent'
sched = {**zero, 'overrides': [{'utc_days': [1]}]}
assert classify(zero, sched, True) == classify(sched, zero, True) == 'scheduled_excluded'
assert classify(zero, empty, False) == 'relisted'

all_meters = sorted({k for r in pricing for k in r['meters']})
events, observations, segments, edits = [], [], [], []
for eid, rs in by_price.items():
    prev = None
    for r in rs:
        a, b = prev['_meters'] if prev else {}, r['_meters']
        changed = {k for k in a.keys() | b.keys() if a.get(k) != b.get(k)} if prev else set()
        same = prev is not None and episode(eid, stamp(prev['scan_at'])) == episode(eid, stamp(r['scan_at']))
        assert episode(eid, stamp(r['scan_at'])) is not None
        reason = reporting_reason(eid, r, prev, changed) if prev and same else ''
        kind = classify(prev, r, same, reason)
        adds, removes = set(b)-set(a), set(a)-set(b)
        comparable = [v for k in CORE[1:] if (v := drift(a, b, k)) is not None]
        eligible = kind == 'counted' and bool(changed & set(CORE)) and not ((adds | removes) & set(CORE)) and bool(comparable)
        event = {**identity(eid), 'scan_at': r['scan_at'], 'previous_scan_at': prev['scan_at'] if prev else '',
                 'class': kind, 'reporting_reason': reason, 'deep_cohort': eid in deep,
                 'changed_meters': ';'.join(sorted(changed)), 'metered_added': ';'.join(sorted(adds)) if prev else '',
                 'metered_removed': ';'.join(sorted(removes)) if prev else '',
                 'retained_rate_changed': bool(changed & a.keys() & b.keys()),
                 'core_change': bool(changed & set(CORE)), 'ratio_eligible': eligible,
                 'ratio_drift': max(comparable) if eligible else '',
                 'discount_changed': prev is not None and Decimal(str(prev['discount'])) != Decimal(str(r['discount'])),
                 'overrides_changed': prev is not None and prev.get('overrides') != r.get('overrides'),
                 'scheduled_before': scheduled(prev) if prev else False, 'scheduled_after': scheduled(r)}
        for meter in CORE:
            event['before_'+meter] = a.get(meter, '') if prev else ''
            event['after_'+meter] = b.get(meter, '')
        events.append(event)
        if prev and same:
            for meter in sorted(prev['meters'].keys() | r['meters'].keys()):
                x, y = prev['meters'].get(meter), r['meters'].get(meter)
                if x == y:
                    continue
                edits.append({**identity(eid), 'scan_at': r['scan_at'], 'class': kind, 'meter': meter,
                              'before_raw': x, 'after_raw': y, 'meaningful_meter_difference': a.get(meter) != b.get(meter)})
        observations.append({**identity(eid), 'scan_at': r['scan_at'], 'class': kind, 'scheduled': scheduled(r),
                             'discount': r['discount'], **{k: b.get(k, '') for k in all_meters},
                             'raw_meters_json': json.dumps(r['meters'], sort_keys=True), 'overrides_json': json.dumps(r.get('overrides'))})
        prev = r
    assert rs[-1]['meters'] == endpoints[eid]['pricing']['meters']
    for start, end in intervals[eid]:
        spell = [r for r in rs if start <= stamp(r['scan_at']) < end]
        if not spell:
            assert start == end
            continue
        assert stamp(spell[0]['scan_at']) == start
        for i, r in enumerate(spell):
            finish = stamp(spell[i+1]['scan_at']) if i+1 < len(spell) else end
            segments.append({**identity(eid), 'start': r['scan_at'], 'end': iso(finish), 'scheduled': scheduled(r),
                             **{k: r['_meters'].get(k, '') for k in CORE}})

write('observations', observations)
write('events', events)
write('raw_meter_edits', edits)
write('segments', segments)
write('listing_intervals', ({**identity(eid), 'start': iso(a), 'end': iso(b)} for eid, spells in intervals.items() for a, b in spells))
counted = [e for e in events if e['class'] == 'counted']
recent = [e for e in counted if e['deep_cohort'] and stamp(e['scan_at']) >= asof-30*DAY]
ep_events = defaultdict(list)
for e in events:
    ep_events[e['endpoint_id']].append(e)
endpoint_rows = []
for eid, e in endpoints.items():
    es = [r for r in ep_events[eid] if r['class'] == 'counted']
    rec = [r for r in es if stamp(r['scan_at']) >= asof-30*DAY]
    p = normalized(e['pricing']['meters'])
    eligible = [r for r in rec if r['ratio_eligible']]
    changes = [abs(Decimal(r['after_prompt']) / Decimal(r['before_prompt'])-1) for r in rec if r['before_prompt'] and r['after_prompt'] and r['before_prompt'] != r['after_prompt']]
    endpoint_rows.append({**identity(eid), 'current': eid in current, 'deep_cohort': eid in deep,
                          'variant': e['variant'], 'is_free': e['metadata'].get('is_free'),
                          'observed_age_days': (asof-intervals[eid][0][0])/DAY,
                          'upstream_age_days': (asof-stamp(e['metadata']['created_at']))/DAY if e['metadata'].get('created_at') else '',
                          'listed_days_30d': exposure(eid, asof-30*DAY), 'changes': len(es), 'changes_30d': len(rec),
                          'ratio_comparisons_30d': len(eligible), 'ratio_preserved_exact_30d': sum(r['ratio_drift'] == 0 for r in eligible),
                          'prompt_moves_30d': len(changes), 'median_absolute_prompt_move_30d': median(changes) if changes else '',
                          'current_scheduled': scheduled(e['pricing']),
                          'scheduled_excluded_30d': sum(r['class'] == 'scheduled_excluded' and stamp(r['scan_at']) >= asof-30*DAY for r in ep_events[eid]),
                          **{k: p.get(k, '') for k in all_meters}})
write('endpoints', endpoint_rows)
ep_summary = {r['endpoint_id']: r for r in endpoint_rows}
model_rows = []
for mid, ids in model_ids.items():
    rows = [ep_summary[eid] for eid in ids]
    model_rows.append({'model_id': mid, 'model_name': models[mid]['display_name'], 'current': bool(set(ids) & current), 'deep_cohort': mid in deep_models,
                       'upstream_age_days': (asof-stamp(models[mid]['or_created_at']))/DAY,
                       'current_endpoints': len(set(ids) & current), 'current_tags': len({endpoints[eid]['provider_tag'] for eid in set(ids) & current}),
                       'historical_tags': len({endpoints[eid]['provider_tag'] for eid in ids}), 'historical_endpoints': len(ids),
                       'changes_30d': sum(r['changes_30d'] for r in rows), 'changed_endpoints_30d': sum(r['changes_30d'] > 0 for r in rows),
                       'active_endpoints_30d': sum(r['listed_days_30d'] > 0 for r in rows),
                       'current_scheduled': sum(r['current_scheduled'] and r['current'] for r in rows)})
model_rows.sort(key=lambda r: -r['changes_30d'])
write('models', model_rows)
org_rows = []
for org in sorted({r['organization'] for r in endpoint_rows}):
    rs = [r for r in endpoint_rows if r['organization'] == org and r['deep_cohort']]
    days = sum(r['listed_days_30d'] for r in rs)
    org_rows.append({'organization': org, 'current_endpoints': sum(r['current'] for r in rs),
                     'active_endpoints_30d': sum(r['listed_days_30d'] > 0 for r in rs),
                     'changed_endpoints_30d': sum(r['changes_30d'] > 0 for r in rs), 'changes_30d': sum(r['changes_30d'] for r in rs),
                     'listed_endpoint_days_30d': days, 'changes_per_100_endpoint_days_30d': 100*sum(r['changes_30d'] for r in rs)/days if days else 0})
org_rows.sort(key=lambda r: -r['changes_30d'])
write('organizations', org_rows)
frequencies = [{'meter': k, 'denominator': len(current), 'metered': sum(k in normalized(endpoints[eid]['pricing']['meters']) for eid in current),
                'unmetered': sum(k not in normalized(endpoints[eid]['pricing']['meters']) for eid in current)} for k in all_meters]
write('meter_frequencies', frequencies)

# Historical cross-sections: reconstruct listing status and the latest observed price at each sample.
samples = [begin]
t = datetime.fromtimestamp(begin, timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
while t.timestamp() < asof:
    samples.append(t.timestamp())
    t += timedelta(days=1)
samples.append(asof)
base_ids = {eid for eid in endpoints if state(eid, begin) is not None}
continuous_survivors = {eid for eid in base_ids if intervals[eid] == [(begin, asof)] and eid in current}
daily, bridges, provider_cache, cache_jumps, variant_history, meter_bridges = [], [], [], [], [], []
previous_states = None
for t in samples:
    states = {eid: r for eid in endpoints if (r := state(eid, t)) is not None}
    cache = {eid for eid, r in states.items() if 'input_cache_read' in r['_meters']}
    row = {'at': iso(t), 'endpoints': len(states), 'models': len({endpoints[eid]['model_id'] for eid in states}),
           'survivor_endpoints': len(continuous_survivors), 'survivor_cache_metered': len(cache & continuous_survivors),
           'survivor_cache_percent': 100*len(cache & continuous_survivors)/len(continuous_survivors) if continuous_survivors else '',
           'scheduled_endpoints': sum(scheduled(r) for r in states.values())}
    for k in all_meters:
        row[k+'_metered'] = sum(k in r['_meters'] for r in states.values())
        row[k+'_percent'] = 100*row[k+'_metered']/len(states)
    daily.append(row)
    for variant in sorted({endpoints[eid]['variant'] for eid in states}):
        ids = {eid for eid in states if endpoints[eid]['variant'] == variant}
        variant_history.append({'at': iso(t), 'variant': variant, 'endpoints': len(ids),
                                'cache_metered': len(ids & cache), 'cache_percent': 100*len(ids & cache)/len(ids)})
    if previous_states is not None:
        old_ids, new_ids = set(previous_states), set(states)
        old_cache = {eid for eid, r in previous_states.items() if 'input_cache_read' in r['_meters']}
        same = old_ids & new_ids
        additions = [eid for eid in same if eid in cache-old_cache]
        removals = [eid for eid in same if eid in old_cache-cache]
        bridge = {'from_at': daily[-2]['at'], 'to_at': row['at'], 'cache_before': len(old_cache), 'cache_after': len(cache),
                  'entering_endpoints': len(new_ids-old_ids), 'exiting_endpoints': len(old_ids-new_ids),
                  'entering_cache_metered': len((new_ids-old_ids) & cache), 'exiting_cache_metered': len((old_ids-new_ids) & old_cache),
                  'continuing_added_cache_meter': len(additions), 'continuing_removed_cache_meter': len(removals)}
        assert len(cache)-len(old_cache) == bridge['entering_cache_metered']-bridge['exiting_cache_metered']+len(additions)-len(removals)
        bridges.append(bridge)
        for meter in ('web_search', 'input_cache_write', 'input_cache_write_1h'):
            old_metered = {eid for eid, r in previous_states.items() if meter in r['_meters']}
            new_metered = {eid for eid, r in states.items() if meter in r['_meters']}
            meter_bridge = {'from_at': daily[-2]['at'], 'to_at': row['at'], 'meter': meter,
                            'before': len(old_metered), 'after': len(new_metered),
                            'entering_metered': len((new_ids-old_ids) & new_metered),
                            'exiting_metered': len((old_ids-new_ids) & old_metered),
                            'continuing_added': len(same & (new_metered-old_metered)),
                            'continuing_removed': len(same & (old_metered-new_metered))}
            assert meter_bridge['after']-meter_bridge['before'] == meter_bridge['entering_metered']-meter_bridge['exiting_metered']+meter_bridge['continuing_added']-meter_bridge['continuing_removed']
            meter_bridges.append(meter_bridge)
        for eid in additions + removals:
            cache_jumps.append({**identity(eid), 'from_at': daily[-2]['at'], 'to_at': row['at'], 'direction': 'metered' if eid in additions else 'unmetered',
                                'before': previous_states[eid]['_meters'].get('input_cache_read', ''), 'after': states[eid]['_meters'].get('input_cache_read', '')})
    if iso(t)[8:10] == '01' or t in (begin, asof):
        by_org = defaultdict(list)
        for eid in states:
            by_org[identity(eid)['organization']].append(eid)
        for org, ids in sorted(by_org.items()):
            provider_cache.append({'at': iso(t), 'organization': org, 'endpoints': len(ids), 'cache_metered': len(set(ids)&cache), 'cache_percent': 100*len(set(ids)&cache)/len(ids)})
    previous_states = states
assert daily[-1]['endpoints'] == len(current)
write('meter_history_daily', daily)
write('cache_population_bridge_daily', bridges)
write('cache_transitions_daily', cache_jumps)
write('cache_by_organization_monthly', provider_cache)
write('variant_history_daily', variant_history)
write('meter_population_bridge_daily', meter_bridges)
cohorts = []
for month in sorted({rs[0]['scan_at'][:7] for rs in by_price.values()}):
    ids = [eid for eid, rs in by_price.items() if rs[0]['scan_at'].startswith(month)]
    metered = sum('input_cache_read' in by_price[eid][0]['_meters'] for eid in ids)
    cohorts.append({'first_observed_month': month, 'endpoints': len(ids), 'initial_cache_metered': metered,
                    'initial_cache_percent': 100*metered/len(ids), 'initial_inventory_included': month == iso(begin)[:7]})
write('cache_first_observed_cohorts', cohorts)

# Ratios measure co-movement only in counted, unscheduled transitions.
ratios, ranks = [], []
for eid in sorted(current):
    p = normalized(endpoints[eid]['pricing']['meters'])
    if 'prompt' not in p:
        continue
    for k in CORE[1:] + ('input_cache_write', 'input_cache_write_1h'):
        if k in p:
            ratios.append({**identity(eid), 'meter': k, 'prompt': p['prompt'], 'value': p[k], 'ratio': p[k]/p['prompt'], 'scheduled': scheduled(endpoints[eid]['pricing'])})
write('current_ratios', ratios)
for mid, ids in model_ids.items():
    tags = defaultdict(list)
    for eid in set(ids)&current:
        tags[endpoints[eid]['provider_tag']].append(normalized(endpoints[eid]['pricing']['meters']))
    valid = {tag: rs[0] for tag, rs in tags.items() if all(r == rs[0] for r in rs)}
    for k in CORE[1:]:
        rs = [(tag, p) for tag, p in valid.items() if 'prompt' in p and k in p]
        pairs = [(a,b) for i, (_,a) in enumerate(rs) for _,b in rs[i+1:] if a['prompt'] != b['prompt']]
        if len(rs) > 1:
            ranks.append({'model_id': mid, 'meter': k, 'comparable_tags': len(rs), 'conflicting_tags_excluded': len(tags)-len(valid),
                          'unequal_prompt_pairs': len(pairs), 'inversions': sum((a['prompt']-b['prompt'])*(a[k]-b[k]) < 0 for a,b in pairs)})
write('cross_meter_rankings', ranks)

# Current user-addressable identity; historical names use latest retained tag labels.
collisions, reuse = [], []
groups = defaultdict(list)
for eid, e in endpoints.items():
    groups[e['model_id'], e['provider_tag']].append(eid)
for (mid, tag), ids in groups.items():
    active = sorted(set(ids)&current)
    if len(ids)>1:
        reuse.append({'model_id': mid, 'provider_tag': tag, 'historical_uuids': len(ids), 'current_uuids': len(active), 'endpoint_ids': ';'.join(ids)})
    if len(active)>1:
        normalized_prices = [normalized(endpoints[eid]['pricing']['meters']) for eid in active]
        full_prices = [{**endpoints[eid]['pricing'], 'meters': {k: str(v.normalize()) for k,v in normalized_prices[i].items()}} for i,eid in enumerate(active)]
        collisions.append({'model_id': mid, 'provider_tag': tag, 'uuids': len(active), 'identical_effective_pricing': all(p == full_prices[0] for p in full_prices),
                           'endpoint_ids': ';'.join(active), 'pricing_json': json.dumps(full_prices, sort_keys=True)})
write('identity_reuse', reuse)
write('current_collisions', collisions)

# All batch counts remain visible for spike investigation, including excluded observations.
batches = defaultdict(list)
for e in events:
    if e['class'] not in ('initial', 'relisted'):
        batches[e['scan_at'], e['organization']].append(e)
batch_rows = []
for (at, org), es in batches.items():
    row = {'at': at, 'organization': org, 'endpoints': len(es), 'models': len({e['model_id'] for e in es}),
           **{k: sum(e['class'] == k for e in es) for k in ['counted', 'unmetered_equivalent', 'scheduled_excluded', 'reporting_excluded', 'metadata_only']},
           'changed_meters': ';'.join(sorted({k for e in es for k in e['changed_meters'].split(';') if k})),
           'model_examples': ';'.join(sorted({e['model_id'] for e in es})[:6])}
    batch_rows.append(row)
batch_rows.sort(key=lambda r: -r['counted'])
write('observation_batches', batch_rows)
batch_evidence = []
for row in batch_rows:
    if row['counted'] < 10:
        continue
    es = [e for e in batches[row['at'], row['organization']] if e['class'] == 'counted']
    prompt_factors, cache_ratios = Counter(), Counter()
    returns_24h = 0
    for e in es:
        if e['before_prompt'] and e['after_prompt']:
            prompt_factors[str((e['after_prompt']/e['before_prompt']).quantize(Decimal('.000001')))] += 1
        if e['after_input_cache_read'] and e['after_prompt']:
            cache_ratios[str((e['after_input_cache_read']/e['after_prompt']).quantize(Decimal('.000001')))] += 1
        eid = e['endpoint_id']
        before = by_price[eid][bisect_right(price_times[eid], stamp(e['previous_scan_at']))-1]
        later = [r for r in by_price[eid] if stamp(e['scan_at']) < stamp(r['scan_at']) <= stamp(e['scan_at'])+DAY
                 and episode(eid, stamp(r['scan_at'])) == episode(eid, stamp(e['scan_at']))]
        returns_24h += any(r['_meters'] == before['_meters'] for r in later)
    batch_evidence.append({**row, 'discount_cochanges': sum(e['discount_changed'] for e in es),
                           'returns_to_prior_meters_within_24h': returns_24h,
                           'prompt_factor_counts_6dp': json.dumps(dict(prompt_factors), sort_keys=True),
                           'cache_ratio_counts_6dp': json.dumps(dict(cache_ratios), sort_keys=True)})
write('large_batch_evidence', batch_evidence)
monthly = []
cursor = datetime.fromtimestamp(begin, timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
while cursor.timestamp() < asof:
    nxt = (cursor.replace(day=28)+timedelta(days=4)).replace(day=1)
    a,b = max(begin,cursor.timestamp()), min(asof,nxt.timestamp())
    es = [e for e in events if a <= stamp(e['scan_at']) < b or stamp(e['scan_at']) == b == asof]
    days = (b-a)/DAY
    endpoint_days = sum(exposure(eid,a,b) for eid in endpoints)
    counts = Counter(e['class'] for e in es)
    monthly.append({'month': cursor.strftime('%Y-%m'), 'covered_days': days, 'partial': a != cursor.timestamp() or b != nxt.timestamp(),
                    'average_listed_endpoints': endpoint_days/days, 'listed_endpoint_days': endpoint_days,
                    **{k: counts[k] for k in ['initial','relisted','counted','unmetered_equivalent','scheduled_excluded','reporting_excluded','metadata_only']},
                    'counted_per_day': counts['counted']/days, 'counted_per_100_endpoint_days': 100*counts['counted']/endpoint_days})
    cursor = nxt
write('monthly', monthly)
assert sum(r['counted'] for r in monthly) == len(counted)

# Coarsening evidence: only complete, continuously listed, unscheduled endpoint-days in the recent window.
by_segments = defaultdict(list)
for r in segments:
    by_segments[r['endpoint_id']].append(r)
day_details = []
end_midnight = datetime.fromtimestamp(asof, timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
for eid in sorted(deep):
    for offset in range(30):
        a,b = end_midnight-(offset+1)*DAY, end_midnight-offset*DAY
        if a < asof-30*DAY:
            continue
        spans = [(max(a,stamp(r['start'])), min(b,stamp(r['end'])), r) for r in by_segments[eid] if stamp(r['start'])<b and stamp(r['end'])>a]
        if not spans or any(r['scheduled'] or not r['prompt'] for _,_,r in spans) or abs(sum(y-x for x,y,_ in spans)-DAY) > .01:
            continue
        values = [Decimal(r['prompt']) for _,_,r in spans]
        if len(set(values))<2:
            continue
        day_details.append({**identity(eid), 'day': iso(a)[:10], 'open': values[0], 'close': values[-1], 'min': min(values), 'max': max(values),
                            'time_weighted_mean': sum(Decimal(str(y-x))*v for (x,y,_),v in zip(spans,values))/Decimal(DAY),
                            'same_open_close': values[0] == values[-1],
                            'extreme_outside_open_close': min(values)<min(values[0],values[-1]) or max(values)>max(values[0],values[-1])})
write('daily_resolution', day_details)
eligible = [e for e in recent if e['ratio_eligible']]
summary = {'revision': 2, 'clock': manifest['clock'], 'history_start': iso(begin),
           'source_counts': manifest['counts'], 'excluded_models': sorted(EXCLUDED), 'excluded_endpoints': len(raw_endpoints)-len(endpoints),
           'scoped_pricing_rows': len(pricing), 'scoped_endpoints': len(endpoints), 'current_endpoints': len(current),
           'current_models': len({endpoints[eid]['model_id'] for eid in current}), 'current_choices': len({(endpoints[eid]['model_id'],endpoints[eid]['provider_tag']) for eid in current}),
           'deep_models': len(deep_models), 'deep_endpoints': len(deep), 'class_counts': dict(Counter(e['class'] for e in events)),
           'reporting_reasons': dict(Counter(e['reporting_reason'] for e in events if e['class']=='reporting_excluded')),
           'recent_class_counts': dict(Counter(e['class'] for e in events if e['deep_cohort'] and stamp(e['scan_at']) >= asof-30*DAY)),
           'changes_30d': len(recent), 'changed_endpoints_30d': len({e['endpoint_id'] for e in recent}),
           'active_endpoints_30d': sum(exposure(eid,asof-30*DAY)>0 for eid in deep),
           'current_models_without_changes_30d': sum(r['current'] and not r['changes_30d'] for r in model_rows),
           'ratio_eligible_30d': len(eligible), 'ratio_preserved_exact_30d': sum(e['ratio_drift']==0 for e in eligible),
           'ratio_preserved_1bp_30d': sum(e['ratio_drift']<=Decimal('.0001') for e in eligible),
           'current_scheduled': sum(scheduled(endpoints[eid]['pricing']) for eid in current),
           'ever_scheduled': len({r['endpoint_id'] for r in pricing if scheduled(r)}),
           'first_schedule_observed': min(r['scan_at'] for r in pricing if scheduled(r)),
           'current_model_age_days': stats([r['upstream_age_days'] for r in model_rows if r['current']]),
           'current_endpoint_age_days': stats([r['upstream_age_days'] for r in endpoint_rows if r['current'] and r['upstream_age_days']!='']),
           'current_tags_per_model': stats([r['current_tags'] for r in model_rows if r['current']]),
           'cache_first': daily[0], 'cache_latest': daily[-1],
           'daily_resolution_days': len(day_details), 'same_open_close_days': sum(r['same_open_close'] for r in day_details),
           'hidden_extreme_days': sum(r['extreme_outside_open_close'] for r in day_details),
           'current_collision_groups': len(collisions), 'conflicting_collision_groups': sum(not r['identical_effective_pricing'] for r in collisions),
           'source_sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((ROOT/'raw').glob('*.jsonl'))}}
(ROOT/'summary.json').write_text(json.dumps(summary, indent=2)+'\n')
print(json.dumps({k:v for k,v in summary.items() if k not in ('cache_first','cache_latest','source_sha256')}, indent=2))
