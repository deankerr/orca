# Public endpoint response sample

This is a reduced sample from OpenRouter's public endpoint API. It preserves the model wrapper and
four representative endpoint records without the volume of the frontend endpoint response.

- Source: `https://openrouter.ai/api/v1/models/moonshotai/kimi-k3/endpoints`
- Captured at: `2026-08-25T10:26:01.960Z`
- The original response contained 14 endpoints.

```json
{
  "data": {
    "id": "moonshotai/kimi-k3",
    "name": "MoonshotAI: Kimi K3",
    "created": 1784215858,
    "description": "Kimi K3 is a 2.8T parameter open-weight multimodal reasoning model from Moonshot AI. It is suited for complex coding, knowledge work, and long-horizon agentic workflows, and is particularly strong at...",
    "architecture": {
      "tokenizer": "Other",
      "instruct_type": null,
      "modality": "text+image+video->text",
      "input_modalities": ["text", "image", "video"],
      "output_modalities": ["text"]
    },
    "endpoints": [
      {
        "name": "Fireworks | moonshotai/kimi-k3-20260715",
        "model_id": "moonshotai/kimi-k3",
        "model_name": "MoonshotAI: Kimi K3",
        "context_length": 1048576,
        "pricing": {
          "prompt": "0.000003",
          "completion": "0.000015",
          "input_cache_read": "0.0000003",
          "discount": 0
        },
        "provider_name": "Fireworks",
        "tag": "fireworks",
        "quantization": "unknown",
        "max_completion_tokens": null,
        "max_prompt_tokens": null,
        "supported_parameters": [
          "reasoning",
          "include_reasoning",
          "max_tokens",
          "temperature",
          "top_p",
          "stop",
          "frequency_penalty",
          "presence_penalty",
          "top_k",
          "repetition_penalty",
          "logit_bias",
          "logprobs",
          "top_logprobs",
          "response_format",
          "structured_outputs",
          "tools",
          "tool_choice",
          "reasoning_effort"
        ],
        "status": 0,
        "uptime_last_30m": 99.82397465234993,
        "uptime_last_5m": 99.822695035461,
        "uptime_last_1d": 99.67730332459791,
        "supports_implicit_caching": false,
        "supports_voice_cloning": false,
        "latency_last_30m": {
          "p50": 2687,
          "p75": 4162.25,
          "p90": 5954,
          "p99": 30351.360000000015
        },
        "throughput_last_30m": {
          "p50": 35,
          "p75": 42,
          "p90": 47,
          "p99": 58
        }
      },
      {
        "name": "Alibaba | moonshotai/kimi-k3-20260715",
        "model_id": "moonshotai/kimi-k3",
        "model_name": "MoonshotAI: Kimi K3",
        "context_length": 1048576,
        "pricing": {
          "prompt": "0.00000345",
          "completion": "0.00001725",
          "input_cache_read": "0.000000345",
          "discount": 0
        },
        "provider_name": "Alibaba",
        "tag": "alibaba",
        "quantization": "unknown",
        "max_completion_tokens": 1048576,
        "max_prompt_tokens": null,
        "supported_parameters": [
          "reasoning",
          "include_reasoning",
          "max_tokens",
          "temperature",
          "top_p",
          "seed",
          "presence_penalty",
          "response_format",
          "structured_outputs",
          "tools",
          "logprobs",
          "top_logprobs",
          "tool_choice",
          "reasoning_effort"
        ],
        "status": -2,
        "uptime_last_30m": 87.32943469785575,
        "uptime_last_5m": 72.72727272727273,
        "uptime_last_1d": 98.42350473636255,
        "supports_implicit_caching": false,
        "supports_voice_cloning": false,
        "latency_last_30m": {
          "p50": 9250,
          "p75": 15235,
          "p90": 24973.2,
          "p99": 53242.44000000004
        },
        "throughput_last_30m": {
          "p50": 11,
          "p75": 15,
          "p90": 18,
          "p99": 27
        }
      },
      {
        "name": "Fireworks | moonshotai/kimi-k3-20260715",
        "model_id": "moonshotai/kimi-k3",
        "model_name": "MoonshotAI: Kimi K3",
        "context_length": 1048576,
        "pricing": {
          "prompt": "0.0000045",
          "completion": "0.0000225",
          "input_cache_read": "0.00000045",
          "discount": 0
        },
        "provider_name": "Fireworks",
        "tag": "fireworks/fast",
        "quantization": "unknown",
        "max_completion_tokens": null,
        "max_prompt_tokens": null,
        "supported_parameters": [
          "reasoning",
          "include_reasoning",
          "max_tokens",
          "temperature",
          "top_p",
          "stop",
          "frequency_penalty",
          "presence_penalty",
          "top_k",
          "repetition_penalty",
          "logit_bias",
          "logprobs",
          "top_logprobs",
          "response_format",
          "structured_outputs",
          "reasoning_effort"
        ],
        "status": 0,
        "uptime_last_30m": 99.65156794425087,
        "uptime_last_5m": 97.95918367346938,
        "uptime_last_1d": 98.8529411764706,
        "supports_implicit_caching": false,
        "supports_voice_cloning": false,
        "latency_last_30m": {
          "p50": 814.5,
          "p75": 1760.25,
          "p90": 3894.1000000000004,
          "p99": 46297.779999999926
        },
        "throughput_last_30m": {
          "p50": 86,
          "p75": 106.25,
          "p90": 128.3,
          "p99": 161.77999999999997
        }
      },
      {
        "name": "Morph | moonshotai/kimi-k3-20260715",
        "model_id": "moonshotai/kimi-k3",
        "model_name": "MoonshotAI: Kimi K3",
        "context_length": 1048576,
        "pricing": {
          "prompt": "0.000006",
          "completion": "0.0000225",
          "input_cache_read": "0.0000006",
          "discount": 0
        },
        "provider_name": "Morph",
        "tag": "morph/fast",
        "quantization": "fp4",
        "max_completion_tokens": 1048576,
        "max_prompt_tokens": null,
        "supported_parameters": [
          "reasoning",
          "include_reasoning",
          "max_tokens",
          "temperature",
          "stop",
          "response_format",
          "structured_outputs",
          "tools",
          "logprobs",
          "top_logprobs",
          "tool_choice",
          "top_p",
          "top_k",
          "min_p",
          "frequency_penalty",
          "presence_penalty",
          "repetition_penalty",
          "seed",
          "logit_bias",
          "reasoning_effort"
        ],
        "status": -2,
        "uptime_last_30m": 91.3821138211382,
        "uptime_last_5m": null,
        "uptime_last_1d": 82.41507018426226,
        "supports_implicit_caching": false,
        "supports_voice_cloning": false,
        "latency_last_30m": {
          "p50": 9612,
          "p75": 21213,
          "p90": 32666,
          "p99": 65212.99999999988
        },
        "throughput_last_30m": {
          "p50": 19,
          "p75": 28,
          "p90": 35,
          "p99": 49
        }
      }
    ]
  }
}
```
