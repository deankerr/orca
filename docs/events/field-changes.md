# Field operations

- Illustrative curated changes for selected fields; names describe the field's presence or membership transition.

```json
[
  { "type": "field_updated", "path": "quantization", "before": "fp8", "after": null },
  { "type": "field_added", "path": "supports_reasoning", "after": false },
  { "type": "field_removed", "path": "limit_rpm", "before": 0 },
  {
    "type": "set_updated",
    "path": "supported_parameters",
    "added": ["tools"],
    "removed": ["temperature"]
  }
]
```

- Set edits carry changed members; whole-field additions/removals carry the complete array.

```json
{ "type": "field_added", "path": "supported_parameters", "after": ["tools", "temperature"] }
```

## Corresponding text details

```text
Quantization changed from "fp8" to null.
Reasoning support was added: no.
Requests per minute was removed; previously 0.
Supported parameters added: "tools".
Supported parameters removed: "temperature".
Supported parameters was added: "tools", "temperature".
```
