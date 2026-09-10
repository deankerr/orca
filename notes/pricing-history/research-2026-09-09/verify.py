"""Check research invariants, source integrity, topic links and exporter pagination offline."""
import csv
from decimal import Decimal
import hashlib
import importlib.util
import json
from pathlib import Path
import re
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent
summary = json.loads((ROOT / 'summary.json').read_text())


def read(name):
    return list(csv.DictReader((ROOT / 'data' / f'{name}.csv').open()))


def effective(raw):
    return {k: Decimal(v) for k,v in json.loads(raw).items() if Decimal(v) != 0}


for name, digest in summary['source_sha256'].items():
    assert hashlib.sha256((ROOT / 'raw' / name).read_bytes()).hexdigest() == digest
for path in (ROOT / 'data').glob('*.csv'):
    for row in csv.DictReader(path.open()):
        assert row.get('model_id') not in summary['excluded_models'], path
obs = {(r['endpoint_id'],r['scan_at']):r for r in read('observations')}
events = read('events')
assert len(obs) == len(events) == summary['scoped_pricing_rows']
for r in events:
    if r['class'] in ('initial','relisted'):
        continue
    a = effective(obs[r['endpoint_id'],r['previous_scan_at']]['raw_meters_json'])
    b = effective(obs[r['endpoint_id'],r['scan_at']]['raw_meters_json'])
    if r['class']=='counted':
        assert a != b and r['scheduled_before'] == r['scheduled_after'] == 'False'
    if r['class']=='unmetered_equivalent':
        assert a == b
    if r['class']=='scheduled_excluded':
        assert 'True' in (r['scheduled_before'],r['scheduled_after'])
assert sum(int(r['counted']) for r in read('monthly')) == summary['class_counts']['counted']
assert sum(int(r['changes_30d']) for r in read('models')) == summary['changes_30d']
current = [r for r in read('endpoints') if r['current']=='True']
assert len(current) == summary['current_endpoints']
for r in read('meter_frequencies'):
    assert int(r['metered']) == sum(bool(e[r['meter']]) for e in current)
    assert int(r['metered'])+int(r['unmetered']) == len(current)
history = read('meter_history_daily')
assert int(history[-1]['input_cache_read_metered']) == sum(bool(r['input_cache_read']) for r in current)
for r in history:
    assert 0 <= int(r['input_cache_read_metered']) <= int(r['endpoints'])
    assert abs(float(r['input_cache_read_percent'])-100*int(r['input_cache_read_metered'])/int(r['endpoints'])) < 1e-10
for r in read('cache_population_bridge_daily'):
    assert int(r['cache_after'])-int(r['cache_before']) == int(r['entering_cache_metered'])-int(r['exiting_cache_metered'])+int(r['continuing_added_cache_meter'])-int(r['continuing_removed_cache_meter'])
for r in read('meter_population_bridge_daily'):
    assert int(r['after'])-int(r['before']) == int(r['entering_metered'])-int(r['exiting_metered'])+int(r['continuing_added'])-int(r['continuing_removed'])
variants = read('variant_history_daily')
for r in history:
    rs = [v for v in variants if v['at'] == r['at']]
    assert sum(int(v['endpoints']) for v in rs) == int(r['endpoints'])
    assert sum(int(v['cache_metered']) for v in rs) == int(r['input_cache_read_metered'])
for path in ROOT.glob('*.md'):
    for link in re.findall(r'\[[^\]]*\]\(([^)]+)\)',path.read_text()):
        if not link.startswith(('http:','https:','#')):
            assert (path.parent / link.split('#')[0]).exists(), (path.name,link)
assert len(list((ROOT / 'figures').glob('*.png'))) == 8
tagged = read('model_family_activity')
family_endpoints = read('current_endpoint_families')
cohorts = read('cohort_activity')
assert {r['model_id'] for r in tagged} == {r['model_id'] for r in read('models') if r['current']=='True'}
assert {r['endpoint_id'] for r in family_endpoints} == {r['endpoint_id'] for r in current}
assert sum(int(r['current_models']) for r in cohorts) == len(tagged)
assert sum(int(r['current_endpoints']) for r in cohorts) == len(current)
for r in tagged:
    if r['model_id'].startswith(('openai/gpt-oss','google/gemma')):
        assert r['cohort'] != 'major_labs'
    for days in (7,30,90):
        assert 0 <= float(r[f'covered_days_{days}d']) <= days+1e-6
        assert int(r[f'input_changes_{days}d']) <= int(r[f'all_meter_changes_{days}d'])
for r in cohorts:
    rs = [m for m in tagged if m['cohort']==r['group']]
    for days in (7,30,90):
        assert sum(int(m[f'all_meter_changes_{days}d']) for m in rs) == int(r[f'all_meter_changes_{days}d'])
        simple = sum(m[f'full_window_{days}d']=='True' and m[f'has_scheduled_span_{days}d']=='False' and int(m[f'input_changes_{days}d'])==0 and 0<int(m[f'window_prompt_levels_{days}d'])<=2 for m in rs)
        assert simple == int(r[f'full_window_flat_two_level_models_{days}d'])
for name in ['explore.py','presence_spikes.py','presence-spikes.md','exploration.json']:
    assert not (ROOT/name).exists(), name

# No query is sent: exercise pagination completion and a stuck-cursor failure.
spec = importlib.util.spec_from_file_location('research_export', ROOT / 'export.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
with patch.object(module, 'query', side_effect=[{'page':[1], 'isDone':False, 'continueCursor':'next'}, {'page':[2], 'isDone':True, 'continueCursor':None}]):
    assert module.read('example') == [1,2]
with patch.object(module, 'query', return_value={'page':[], 'isDone':False, 'continueCursor':None}):
    try:
        module.read('example')
    except RuntimeError:
        pass
    else:
        raise AssertionError('Stuck pagination was not detected')
print('Research invariants, exclusions, source hashes, local links and offline export checks passed.')
