# Feed lifecycle examples

- Arrival excerpt from the September 29 replay; curated facts appear under `after`.

```json
{
  "type": "endpoint_added",
  "observed_at": "2026-09-29T05:40:04.277Z",
  "summary": "Kimi K3 is now listed on Decart (decart/mxfp4).",
  "details": [
    "Input price: $3 per million tokens.",
    "Output price: $15 per million tokens.",
    "Context length: 1,048,576."
  ],
  "after": {
    "context_length": 1048576,
    "pricing": {
      "prompt": "0.000003",
      "completion": "0.000015"
    }
  }
}
```

- Illustrative departure excerpt for the same offering; last-known facts appear under `before`.

```json
{
  "type": "endpoint_removed",
  "summary": "Kimi K3 is no longer listed on Decart (decart/mxfp4).",
  "details": ["Input price when last observed: $3 per million tokens."],
  "before": {
    "pricing": { "prompt": "0.000003" }
  }
}
```
