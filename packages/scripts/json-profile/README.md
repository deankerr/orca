# JSON profile

`json-profile` describes the observed shape and values of a population of JSON objects. It is a
wide view intended for data whose structure is unknown or changes over time. The result is JSON so
it can be queried directly or used as input to later reports and comparisons.

The generic profiler does not infer or enforce a schema; the ORCA bundle adapter accepts
`ModelEndpointsV1`. The profiler does not retain record identity or report correlations between
separate properties. A key set records which properties occurred together on an object, but values
from those properties cannot be linked back to the same input record.

## Usage

From the repository root:

```sh
bun run --cwd packages/scripts json-profile -- [bundle-filter]
```

The input may be a direct `.json` or `.json.gz` path or a filename fragment matched in
`BUNDLES_PATH`. The latest match is selected; with no input, the latest bundle in `BUNDLES_PATH` is
used. The report is written under `OUTPUT_PATH` as
`json-profile.<crawl_at>.me1.orca.json`.

- `--text-models` includes only models whose `input_modalities` and `output_modalities` both contain
  `text`. Endpoints are also included only when their associated model passes the same filter, and
  the output filename starts with `json-profile.text-only.`.

The report always contains both model and endpoint profiles. It records the active model filter
under `selection` so a filtered profile is not mistaken for a complete one.

## Architecture

The code has two layers:

- [`library/profile.ts`](library/profile.ts) is the generic profiler. It accepts in-memory JSON
  objects and knows nothing about files, bundles, models, endpoints, or ORCA.
- [`../model-endpoints-v1.ts`](../model-endpoints-v1.ts) loads and validates the shared bundle
  format. [`bundle.ts`](bundle.ts) extracts records and constructs the report; [`index.ts`](index.ts)
  handles the command-line and file output.

All input is validated as `ModelEndpointsV1` before records are selected. Invalid JSON text fails
during parsing.

## Data format

An ORCA report has the format identifier `orca-bundle-json-profile-v1`, source metadata, the active
filter, and a profile for each record population. Each population has the format
identifier `json-record-profile-v1`, its record count, and a root value profile.

A value profile contains:

- `path`: an RFC 9535 JSONPath relative to the logical array of input records.
- `population`: the number of locations at which the value could occur.
- `types`: one branch for every JSON type actually observed at that path.

An object branch contains its occurrence `count`, exact `key_sets`, and recursively profiled
`fields`. Every field adds:

- `name`: the literal object property name.
- `none`: the number of objects in the field's population that did not contain that property.

`none` and JSON `null` are deliberately distinct. For three objects where a property is absent
once, `null` once, and a string once, the field has `population: 3`, `none: 1`, and separate `null`
and `string` type counts of one each. “None” describes non-occurrence; it is not an input value and
does not imply defective data.

Primitive branches contain exact value-frequency pairs using native JSON values:

```json
{
  "type": "string",
  "count": 2,
  "values": [{ "value": "ready", "count": 2 }]
}
```

The value is not JSON encoded a second time. Strings remain strings, numbers remain numbers, and
booleans remain booleans.

Array branches contain an exact length histogram and one recursive profile of all observed items.
Array order is intentionally ignored, while repeated items still contribute repeated observations.
Object property order is also ignored. Profile collections are sorted to make equivalent input
populations produce byte-identical data regardless of record, object-key, or array order.
