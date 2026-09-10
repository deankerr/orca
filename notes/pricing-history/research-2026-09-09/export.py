"""Refresh this study's source from existing read-only dev queries; no deployment or mutation.

Run deliberately, then regenerate analysis/figures and review topic narratives against the new clock.
"""
from datetime import datetime, timezone
import json
from pathlib import Path
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parent
URL = 'https://fantastic-mosquito-881.convex.cloud/api/query'
TABLES = {'models': 'models', 'providers': 'providers', 'endpoints': 'endpoints',
          'listings': 'endpointListings', 'pricing': 'endpointsPricing'}


def query(name, args):
    payload = {'path': 'v3/projections/queries:' + name, 'args': args, 'format': 'json'}
    request = urllib.request.Request(URL, data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=60) as response:
        result = json.load(response)
    if result.get('status') != 'success':
        raise RuntimeError(f'Query {name} failed: {result}')
    return result['value']


def read(table):
    rows, cursor = [], None
    while True:
        page = query(table, {'paginationOpts': {'cursor': cursor, 'numItems': 500}})
        rows.extend(page['page'])
        if page['isDone']:
            return rows
        if page['continueCursor'] == cursor:
            raise RuntimeError(f'Pagination did not advance for {table}')
        cursor = page['continueCursor']


if __name__ == '__main__':
    # Stage before replacing any source files so a query/clock failure preserves the prior export.
    with tempfile.TemporaryDirectory(prefix='.export-', dir=ROOT) as directory:
        staged = Path(directory)
        before = query('currentScan', {})
        counts = {}
        for name, table in TABLES.items():
            rows = read(table)
            counts[name] = len(rows)
            (staged / f'{name}.jsonl').write_text(''.join(json.dumps(r)+'\n' for r in rows))
        after = query('currentScan', {})
        if before != after:
            raise RuntimeError('Ingestion clock changed during export; repeat the export')
        manifest = {'exported_at': datetime.now(timezone.utc).isoformat(), 'deployment': 'fantastic-mosquito-881 (personal dev)',
                    'clock': after['scan_at'], 'current_scan': after, 'counts': counts,
                    'ingestion_clock_unchanged_during_export': True,
                    'note': 'Sequential reads, not a database transaction; clock equality does not detect every possible concurrent edit.'}
        (ROOT / 'raw').mkdir(exist_ok=True)
        for name in TABLES:
            (staged / f'{name}.jsonl').replace(ROOT / 'raw' / f'{name}.jsonl')
        (ROOT / 'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
        print(json.dumps(counts, indent=2))
