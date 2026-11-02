#!/usr/bin/env python3
"""Audit pricing representations in the retained 2026-10-27 scan; writes this study's CSVs."""
import collections
import csv
import datetime
import decimal
import gzip
import json
import pathlib
import re

HERE = pathlib.Path(__file__).resolve().parent
SCAN = HERE.parent / '2026-10-28-scan-study' / 'scan.2026-10-27T23:40:40.374Z.jsonl.gz'
CONTEXT_KEY = re.compile(r'high_context|long_context|tier[23]')
Dec = decimal.Decimal


def in_text_population(entry):
    model = entry['model']
    return (
        not entry['model_id'].startswith('google/lyria')
        and 'text' in model['input_modalities']
        and 'text' in model['output_modalities']
    )


def leaf(key):
    return key.rpartition(':')[2]


def conditions(row):
    return tuple(sorted(k for k in row if k == 'min_prompt_tokens' or k.startswith('utc')))


def override_class(rows):
    kinds = {'schedule' if any(k.startswith('utc') for k in row) else 'prompt-length' if 'min_prompt_tokens' in row else 'unknown' for row in rows}
    return '+'.join(sorted(kinds))


def is_active(row, now):
    """Evaluate a schedule row; 0 as utc_end means midnight."""
    clock = now.hour * 100 + now.minute
    if 'utc_days' in row and now.strftime('%A').lower() not in row['utc_days']:
        return False
    return 'utc_start' not in row or row['utc_start'] <= clock < (row['utc_end'] or 2400)


def context_tiers(endpoint):
    return [
        t['sku_label']
        for d in endpoint['display_pricing'] if d['sku_label'] == 'Input Price'
        for t in d.get('tiers') or []
        if re.match(r'^[≤>]', t['sku_label'])
    ]


def schedule_style(endpoint):
    source = {leaf(k): v for k, v in endpoint['pricing_json'].items()}
    if not any('peak' in k for k in source):
        return ''
    if 'peak_cache_miss_tokens' in source:
        return 'cache-hit/miss, two windows, Asia/Shanghai weekend flags'
    inverted = Dec(str(source['peak_prompt_tokens'])) < Dec(str(source['prompt_tokens']))
    return 'peak_* holds the cheaper band' if inverted else 'peak_* holds the dearer band'


def source_thresholds(endpoint):
    return sorted(int(v) for k, v in endpoint['pricing_json'].items() if re.search(r'(context|tier\d)_threshold', leaf(k)))


def main():
    entries = [json.loads(line) for line in gzip.open(SCAN, 'rt') if line.strip()]
    now = datetime.datetime.fromisoformat(entries[0]['scan_at'].replace('Z', '+00:00'))
    pairs = [(e, x) for e in entries for x in e['endpoints'] or []]
    text_ids = {id(x) for e, x in pairs if in_text_population(e)}
    print('endpoints', len(pairs), 'text', len(text_ids))

    shapes = collections.Counter()
    shape_endpoints = collections.defaultdict(set)
    records = []
    for entry, endpoint in pairs:
        pricing = endpoint['pricing']
        rows = pricing.get('overrides') or []
        for row in rows:
            key = (' '.join(conditions(row)), ' '.join(sorted(k for k in row if k not in conditions(row))))
            shapes[key] += 1
            shape_endpoints[key].add(endpoint['id'])
        source_keys = [k for k in endpoint['pricing_json'] if CONTEXT_KEY.search(leaf(k))]
        peak = schedule_style(endpoint)
        if not rows and not source_keys and not peak:
            continue
        priced = [r for r in rows if 'min_prompt_tokens' in r]
        ratio = max((Dec(r['prompt']) / Dec(pricing['prompt']) for r in priced), default=None)
        active = [r for r in rows if conditions(r) and 'min_prompt_tokens' not in r and is_active(r, now)]
        records.append({
            'model': entry['model_id'],
            'provider': endpoint['provider_info']['slug'],
            'variant': endpoint['variant'],
            'service_tier': endpoint.get('service_tier') or '',
            'override_class': override_class(rows) if rows else '',
            'override_rows': len(rows),
            'distinct_prompt_rates': len({r['prompt'] for r in rows}),
            'thresholds': ' '.join(str(r['min_prompt_tokens']) for r in priced),
            'source_thresholds': ' '.join(map(str, source_thresholds(endpoint))),
            'source_prompt_meter': any('prompt_tokens' in leaf(k) and 'cached' not in leaf(k) for k in source_keys),
            'display_context_tiers': ' '.join(context_tiers(endpoint)),
            'schedule_source_style': peak,
            'schedule_active_rows': len(active) if peak else '',
            'schedule_active_matches_current': all(r['prompt'] == pricing['prompt'] and r['completion'] == pricing['completion'] for r in active) if peak else '',
            'discount': pricing['discount'],
            'max_prompt_multiple': f'{ratio:.2f}' if ratio else '',
        })

    with open(HERE / 'override-shapes.csv', 'w', newline='') as out:
        writer = csv.writer(out)
        writer.writerow(['conditions', 'rate_meters', 'rows', 'endpoints'])
        for key, count in shapes.most_common():
            writer.writerow([*key, count, len(shape_endpoints[key])])

    with open(HERE / 'conditional-endpoints.csv', 'w', newline='') as out:
        writer = csv.DictWriter(out, fieldnames=records[0])
        writer.writeheader()
        writer.writerows(sorted(records, key=lambda r: (r['override_class'], r['model'], r['provider'])))

    meters = collections.defaultdict(lambda: {'all': 0, 'text': 0, 'zero': 0})
    for _, endpoint in pairs:
        for meter, value in endpoint['pricing'].items():
            if meter in ('discount', 'display_pricing', 'overrides'):
                continue
            meters[meter]['all'] += 1
            meters[meter]['text'] += id(endpoint) in text_ids
            meters[meter]['zero'] += Dec(value) == 0
    with open(HERE / 'meters.csv', 'w', newline='') as out:
        writer = csv.writer(out)
        writer.writerow(['meter', 'endpoints', 'text_endpoints', 'zero_values'])
        for meter, c in sorted(meters.items(), key=lambda kv: -kv[1]['all']):
            writer.writerow([meter, c['all'], c['text'], c['zero']])

    # Reconciliation: the listing's 233 long-context endpoints and the 226 override carriers.
    classes = collections.Counter(r['override_class'] for r in records)
    print('classes', classes.most_common())
    assert classes == {'prompt-length': 216, 'schedule': 10, '': 17}
    assert sum(shapes.values()) == 247
    assert all(r['thresholds'] == r['source_thresholds'] for r in records if r['override_class'] == 'prompt-length')
    assert all(r['schedule_active_rows'] == 1 and r['schedule_active_matches_current'] for r in records if r['override_class'] == 'schedule')
    assert not any(r['discount'] for r in records if r['override_class'])
    print('written', len(records))


main()
