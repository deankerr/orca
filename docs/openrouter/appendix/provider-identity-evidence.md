# Provider identity evidence

## Capture population

The 2026-10-07T17:40:37.518Z capture contained 1,604 endpoints. ORCA's text scope retained
1,381 of them. Counts below describe this capture unless another date is given.

| Measure                 | Population      | Count |
| ----------------------- | --------------- | ----- |
| Embedded provider slugs | Full capture    | 121   |
| Provider names          | Full capture    | 92    |
| Endpoint routing tags   | Full capture    | 229   |
| Embedded provider slugs | ORCA text scope | 108   |

Endpoint `provider_name` equaled `provider_info.name` throughout this capture and the earliest
retained capture, 2025-08-13T20:19:21.211Z. Names spanned several records and could conflict with
slug families: an `anthropic/claude-on-aws` record called itself `Amazon Bedrock`.

Multiple provider bodies shared a slug while differing in adapter, host, pricing strategy, and
occasionally display name. Four routing tags occurred under multiple embedded provider slugs.
Across the full capture, 142 endpoint/provider policy pairs disagreed on a shared key.

Older provider bodies also contained owners/editors, model denylists, region overrides,
multipart capability, and behavioral policies nested under `dataPolicy.paidModels`.

## Variation after ORCA extraction

Provider-field omissions and identity normalization left 79 providers across the 1,381 in-scope
endpoint observations. All remaining disagreements within a provider were in `displayName`.

| Providers | Remaining variation                                |
| --------- | -------------------------------------------------- |
| 67        | Identical cleaned records across all observations. |
| 9         | Labels differed only on aliases.                   |
| 3         | Labels competed even on the exact base slug.       |

Alias-only differences affected Alibaba, Baseten, Decart, DeepInfra, Fireworks, Google Vertex,
MiniMax, Moonshot AI, and SambaNova. Competing base-slug labels had these observation counts:

| Provider       | Ordinary label | Other label |
| -------------- | -------------- | ----------- |
| Azure          | 60             | 1 BYOK Only |
| Amazon Bedrock | 50             | 1 BYOK Only |
| Morph          | 6              | 1 Fast      |

Every provider had a base-slug observation. Excluding aliases left 1,235 observations; voting
over all observations produced the same winning labels.

This single capture does not establish agreement across history. The Claude-on-AWS observations
below include conflicting URLs and BYOK flags. A general relationship between label variants and
internal hosts remains unestablished.

## Historical aliases

These observations come from archived production captures and the retained provider catalog
inspected in October 2026. Transition times bound observed changes, not exact upstream change times.

### SambaNova

`sambanova-turbo` and `sambanova` coexisted in the October capture with the same name and API host.
The turbo spelling was an unslashed serving variant.

### Nebius

`nebius-fast` was present in the earliest retained August 2025 capture. Between
2025-10-07T00:11:13.924Z and 2025-10-07T01:11:40.360Z, endpoint
`41c6e987-156d-4426-b1d6-d374b0ee760f` changed its provider slug and tag to `nebius/fast`,
retaining its model, API host, and adapter.

### W&B

Between 2026-07-23T22:50:26.251Z and 2026-07-24T00:50:26.247Z, the same 19 endpoint UUIDs changed
from `wandb` to `wandb-legacy`. Their provider host and name agreed.

### ModelRun

Retained `model-run` and `modelrun` records shared the name `ModelRun`; the later display name
was `ModelRun [by Modular]`. Host and policy URLs differed.

### Claude Platform on AWS

Focused searches located these adjacent absence/presence boundaries. They establish observed
onsets of the runs examined, rather than an exhaustive search for earlier appearances or interruptions.

| Embedded slug                  | First present capture at located boundary | Last present capture checked              |
| ------------------------------ | ----------------------------------------- | ----------------------------------------- |
| `anthropic/2`                  | 2026-04-03T22:50:00.116Z                  | 2026-08-17T23:30:04.172Z                  |
| `anthropic/claude-on-aws`      | 2026-05-30T03:50:00.314Z                  | 2026-08-17T21:30:04.171Z                  |
| `amazon-bedrock/claude-on-aws` | 2026-06-09T17:50:00.557Z                  | 2026-08-17T21:30:04.171Z                  |
| `claude-on-aws`                | 2026-07-25T20:50:26.218Z                  | Still present on 2026-10-07T17:40:37.518Z |

`anthropic/2` initially displayed `Anthropic 2` and used `https://api.anthropic.com/v1`.
The same endpoint UUIDs subsequently displayed `Claude Platform on AWS` and used
`https://aws-external-anthropic.us-east-1.api.aws/v1`; this was visible by 2026-05-15.

By 2026-08-17, all four spellings used that AWS host and service label. Their remaining
metadata differed:

| Records             | Name                   | Policy/status URLs |
| ------------------- | ---------------------- | ------------------ |
| Older named aliases | Amazon Bedrock         | AWS                |
| `anthropic/2`       | Anthropic              | Anthropic          |
| `claude-on-aws`     | Claude Platform on AWS | Anthropic          |

The canonical record had a different BYOK flag. Adapter and behavioral defaults also differed.
At 2026-08-18T01:30:04.089Z, only the canonical spelling remained among these records;
some endpoint UUIDs had been replaced rather than renamed.
