### Model (from catalog endpoint)

- `endpoint` is a nullable, embedded copy of its "top endpoint", which is the endpoint that is receiving the most traffic.
  - If this field is `null`, that means this model has _zero_ endpoints, and its `/stats/endpoint` will 404.
  - The record isn't valuable, since it will be with the rest of the model's endpoints.
- All of the unique model data exists on each endpoint.
- Contains an embedded copy of itself via its top endpoint.
- Model records tell us very little of interest themselves, which is why ORCA is endpoint-focused.
- `permaslug` may or may not be the same as `slug`.
  - It is necessary for querying `/stats/endpoint`.
  - It has _never_ changed independently from `slug` in our archive history.

```jsonc
// /api/frontend/v1/catalog/models -> data
[
  {
    // **omitted** 25 low value keys
    "slug": "nvidia/nemotron-nano-12b-v2-vl",
    "permaslug": "nvidia/nemotron-nano-12b-v2-vl",
    "author": "nvidia",
    "endpoint": {
      // embedded "top" endpoint
      // **omitted** 13 low value keys
      "variant": "free",
      "id": "28304d1d-c2b9-4291-ba4d-dc63e798227e",
      "name": "Nvidia | nvidia/nemotron-nano-12b-v2-vl:free",
      "context_length": 128000,
      "model": {
        // embedded model is identical to outer model, except for:
        // - name/short name missing the `(variant)` suffix
        // - another embedded endpoint
        //
        // **omitted** 25 low value keys
        "slug": "nvidia/nemotron-nano-12b-v2-vl",
        "hf_slug": "nvidia/NVIDIA-Nemotron-Nano-12B-v2-VL-BF16",
        "updated_at": "2026-02-27T19:15:13.186228+00:00",
        "created_at": "2025-10-28T18:19:25.723503+00:00",
        "name": "NVIDIA: Nemotron Nano 12B 2 VL",
        "short_name": "Nemotron Nano 12B 2 VL",
        "author": "nvidia",
        "author_display_name": "Nvidia",
        "description": "", // **omitted** 1081 chars
        "context_length": 128000,
        "input_modalities": ["image", "text", "video"],
        "output_modalities": ["text"],
        "warning_message": "Note: For the free endpoint, all prompts and output are logged to improve the provider's model and its product and services. Please do not upload any personal, confidential, or otherwise sensitive information. This is a trial use only. Do not use for production or business-critical systems.",
        "promotion_message": "",
        "permaslug": "nvidia/nemotron-nano-12b-v2-vl",
        "supports_reasoning": true,
        "reasoning_config": {
          "start_token": "<think>",
          "end_token": "</think>",
          "system_prompt": null,
        },
        "features": {
          "reasoning_config": {
            "start_token": "<think>",
            "end_token": "</think>",
            "system_prompt": null,
          },
          "chat_template_config": {},
        },
        "default_parameters": {
          "temperature": null,
          "top_p": null,
          "frequency_penalty": null,
        },
        //
      },
      "model_variant_slug": "nvidia/nemotron-nano-12b-v2-vl:free", // the "true" model slug and best primary key for a model
      "model_variant_permaslug": "nvidia/nemotron-nano-12b-v2-vl:free",
      "provider_name": "Nvidia",
      "provider_info": {
        // the only available source of the Provider entity, after its dedicated endpoint was removed
        //
        // **omitted** 8 low value keys
        "name": "Nvidia",
        "displayName": "NVIDIA",
        "slug": "nvidia",
        "headquarters": "US",
        "datacenters": ["US"],
        "sendClientIp": false, // always false, would be highly controversial to become true
        // **omitted** 12 more provider keys which are denomralized onto endpoint
        // ... and can be overridden per endpoint, making these ones misleading/practically useless
        //
      },
      "provider_display_name": "NVIDIA",
      "provider_slug": "nvidia",
      "provider_model_id": "nvidia/nvidia-nemotron-nano-12b-v2-vl",
      "quantization": "unknown",
      "is_free": true,
      "can_abort": true,
      "max_prompt_tokens": null,
      "max_completion_tokens": 128000,
      "max_tokens_per_image": null,
      "supported_parameters": [
        "reasoning",
        "include_reasoning",
        "temperature",
        "max_tokens",
        "seed",
        "top_p",
        "tool_choice",
        "tools",
      ],
      "is_byok": false,
      "moderation_required": false,
      "data_policy": {
        "training": true,
        "trainingOpenRouter": true,
        "retainsPrompts": true,
        "canPublish": false,
        "termsOfServiceURL": "https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA%20API%20Trial%20Terms%20of%20Service.pdf",
        "privacyPolicyURL": "https://www.nvidia.com/en-us/about-nvidia/privacy-policy/",
      },
      "pricing": {
        "prompt": "0",
        "completion": "0",
        "discount": 0,
        "display_pricing": [
          {
            "kind": "token",
            "sku_label": "Input Price",
            "price": "0",
            "displayMultiplier": 1000000,
            "unitLabel": "/M tokens",
          },
          {
            "kind": "token",
            "sku_label": "Output Price",
            "price": "0",
            "displayMultiplier": 1000000,
            "unitLabel": "/M tokens",
          },
        ],
      },
      "display_pricing": [
        {
          "kind": "token",
          "sku_label": "Input Price",
          "price": "0",
          "displayMultiplier": 1000000,
          "unitLabel": "/M tokens",
        },
        {
          "kind": "token",
          "sku_label": "Output Price",
          "price": "0",
          "displayMultiplier": 1000000,
          "unitLabel": "/M tokens",
        },
      ],
      "pricing_json": {
        "openai:prompt_tokens": "0",
        "openai:completion_tokens": "0",
        "openai:cached_prompt_tokens": "0",
      },
      "supports_tool_parameters": true,
      "supports_reasoning": true,
      "supports_multipart": true,
      "limit_rpm": null,
      "limit_rpd": null,
      "has_completions": false,
      "has_chat_completions": true,
      "features": {
        "supports_multipart": true,
        "supports_base64_video_input": true,
        "supports_video_urls": true,
        "supports_input_audio": false,
        "disable_free_endpoint_limits": false,
        "supports_tool_choice": {
          "literal_none": true,
          "literal_auto": true,
          "literal_required": true,
          "type_function": true,
        },
      },
      "provider_region": null,
      "deprecation_date": null,
      "created_at": "2025-10-28T18:19:57.270Z",
      "status": -5,
      //
    },
    "hf_slug": "nvidia/NVIDIA-Nemotron-Nano-12B-v2-VL-BF16",
    "updated_at": "2026-02-27T19:15:13.186Z",
    "created_at": "2025-10-28T18:19:25.723Z",
    "name": "NVIDIA: Nemotron Nano 12B 2 VL (free)",
    "short_name": "Nemotron Nano 12B 2 VL (free)",
    "author_display_name": "Nvidia",
    "description": "", // **omitted** 1081 chars
    "context_length": 128000, // denormalized from top endpoint, may change
    "input_modalities": ["image", "text", "video"],
    "output_modalities": ["text"],
    "warning_message": "Note: For the free endpoint, all prompts and output are logged to improve the provider's model and its product and services. Please do not upload any personal, confidential, or otherwise sensitive information. This is a trial use only. Do not use for production or business-critical systems.",
    "promotion_message": "",
    "supports_reasoning": true,
    "reasoning_config": {
      "start_token": "<think>",
      "end_token": "</think>",
      "system_prompt": null,
    },
    "features": {
      "reasoning_config": {
        "start_token": "<think>",
        "end_token": "</think>",
        "system_prompt": null,
      },
      "chat_template_config": {},
    },
    "default_parameters": {
      "temperature": null,
      "top_p": null,
      "frequency_penalty": null,
    },
  },
]
```

### Endpoint Stats

Endpoints from the endpoints endpoint are exactly the same as the embedded model copy,
but MAY also included stats fields, which appear to be denormalized from another source.

- If the stats nested object is present, it will always have the full set (non-optional keys).
- `stats` has always existed, but other noisy stats keys have come and gone.
- The endpoint returns all currently available for a endpoints for a model scope (`permaslug` + `variant`)

```jsonc
// /api/frontend/v1/stats/endpoint?permaslug=nvidia/nemotron-nano-12b-v2-vl&variant=free
[
  {
    "model": {
      // ... as above embedded model
      // names missing variant suffix
    },
    "stats": {
      "endpoint_id": "3a632f37-731d-4200-9e38-413a5f5dd39d",
      "p50_throughput": 46,
      "p75_throughput": 83.5,
      "p90_throughput": 118,
      "p95_throughput": 132.5999999999999,
      "p99_throughput": 145.09,
      "p50_latency": 662,
      "p75_latency": 817,
      "p90_latency": 962.6,
      "p95_latency": 1020.0999999999997,
      "p99_latency": 1223.45,
      "request_count": 198,
      "window_minutes": 30,
    },
    "statsByTier": {
      "default": {
        "endpoint_id": "3a632f37-731d-4200-9e38-413a5f5dd39d",
        "p50_throughput": 46,
        "p75_throughput": 83.5,
        "p90_throughput": 118,
        "p95_throughput": 132.5999999999999,
        "p99_throughput": 145.09,
        "p50_latency": 662,
        "p75_latency": 817,
        "p90_latency": 962.6,
        "p95_latency": 1020.0999999999997,
        "p99_latency": 1223.45,
        "request_count": 198,
        "window_minutes": 30,
      },
    },
  },
]
```
