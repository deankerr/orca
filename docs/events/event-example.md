# Stored event example

- Illustrative envelope excerpt followed by its decoded `change_json` value.
- A single endpoint UPDATE can carry both a price change and a capability addition.

```json
{
  "scan_at": "2026-09-29T01:00:00.000Z",
  "entity_kind": "endpoint",
  "entity_id": "example-endpoint",
  "type": "UPDATE"
}
```

```json
{
  "key": "example-endpoint",
  "type": "UPDATE",
  "changes": [
    {
      "key": "pricing",
      "type": "UPDATE",
      "changes": [
        {
          "key": "meters",
          "type": "UPDATE",
          "changes": [
            { "key": "prompt", "type": "UPDATE", "oldValue": "0.0000001", "value": "0.00000015" }
          ]
        }
      ]
    },
    {
      "key": "metadata",
      "type": "UPDATE",
      "changes": [
        {
          "key": "supported_parameters",
          "type": "UPDATE",
          "embeddedKey": "$value",
          "changes": [{ "key": "tools", "type": "ADD", "value": "tools" }]
        }
      ]
    }
  ]
}
```
