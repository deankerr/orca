# Feed update example

- Complete illustrative rendering of the stored event example.

```json
{
  "observed_at": "2026-09-29T01:00:00.000Z",
  "entity_kind": "endpoint",
  "entity_id": "example-endpoint",
  "context": {
    "model": { "model_id": "author/model", "display_name": "Example model" },
    "provider": { "provider_id": "provider", "display_name": "Provider" },
    "endpoint": {
      "endpoint_id": "example-endpoint",
      "provider_tag": "provider/fp8",
      "provider_display_name": "Regional offering"
    }
  },
  "type": "endpoint_updated",
  "summary": "Example model on Regional offering (provider/fp8) has updated endpoint details.",
  "details": ["Input price changed from $0.1 to $0.15.", "Supported parameters added: \"tools\"."],
  "changes": [
    {
      "type": "field_updated",
      "path": "pricing.prompt",
      "before": "0.0000001",
      "after": "0.00000015"
    },
    {
      "type": "set_updated",
      "path": "supported_parameters",
      "added": ["tools"],
      "removed": []
    }
  ]
}
```
