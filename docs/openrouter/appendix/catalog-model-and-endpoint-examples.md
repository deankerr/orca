# Catalog model and endpoint examples

Annotated payload examples from the catalog model list and endpoint stats API, with selected fields omitted.

The capture time for these examples was not recorded. They illustrate observed payload shapes;
field presence and equality here do not establish catalog-wide invariants.

## Catalog model

This sample embeds a top endpoint, which embeds another model copy. The inner model's display
names omit the variant suffix, while the endpoint's `model_variant_slug` includes `:free`.
The outer and inner models use the same base `slug` and `permaslug`.

```jsonc
// /api/frontend/v1/catalog/models -> data
[
  {
    // 25 fields omitted
    "slug": "nvidia/nemotron-nano-12b-v2-vl",
    "permaslug": "nvidia/nemotron-nano-12b-v2-vl",
    "author": "nvidia",
    "endpoint": {
      // embedded "top" endpoint
      // 13 fields omitted
      "variant": "free",
      "id": "28304d1d-c2b9-4291-ba4d-dc63e798227e",
      "name": "Nvidia | nvidia/nemotron-nano-12b-v2-vl:free",
      "context_length": 128000,
      "model": {
        // embedded model is identical to outer model, except for:
        // - name/short name missing the `(variant)` suffix
        // - another embedded endpoint
        //
        // 25 fields omitted
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
      "model_variant_slug": "nvidia/nemotron-nano-12b-v2-vl:free", // variant identifier
      "model_variant_permaslug": "nvidia/nemotron-nano-12b-v2-vl:free",
      "provider_name": "Nvidia",
      "provider_info": {
        // embedded provider record
        //
        // 8 fields omitted
        "name": "Nvidia",
        "displayName": "NVIDIA",
        "slug": "nvidia",
        "headquarters": "US",
        "datacenters": ["US"],
        "sendClientIp": false, // observed value
        // 12 provider fields omitted
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

## Endpoint stats

The stats response uses the endpoint shape with additional telemetry. This excerpt shows
matching `stats` and `statsByTier.default` values. Omitted identity fields and the absence of a
capture timestamp prevent treating the two examples as a matched observation pair.

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
