# Provider observations

OpenRouter's embedded provider records mix provider facts, routing variants, and
endpoint configuration. Their fields are evidence, rather than an authoritative
entity model.

## Namespaces and metadata

The 2026-10-07T17:40:37.518Z capture contains 1,604 endpoints, 121 distinct `provider_info.slug`
values, 92 provider names, and 229 endpoint routing tags. ORCA's text scope contains 1,381 endpoints
and 108 embedded slugs.

Endpoint `provider_name` equals `provider_info.name` throughout that capture and the earliest
retained capture, 2025-08-13T20:19:21.211Z. Names can span several provider records. Historical
names also conflict with slug families: an `anthropic/claude-on-aws` record calls itself `Amazon
Bedrock`.

Multiple provider bodies share a slug. In the October capture, adapter, host, pricing strategy, and
occasionally display name vary between endpoints. A last writer can therefore promote incidental
endpoint configuration into provider facts.

Endpoint policy is the source for behavioral claims. In the October capture, 142 endpoint/provider
policy pairs disagree on a shared key. Terms and privacy URLs remain useful provider facts.

Endpoint tags form another namespace: four tags in the October capture occur under multiple embedded
provider slugs. Preserve the tag supplied on each endpoint.

Older provider bodies include owners/editors, model denylists, region overrides, multipart
capability, and behavioral policies nested under `dataPolicy.paidModels`.

## Provider names and the provider-list endpoint

`provider_info.name` behaves like an internal provider key: it is shared across
routing variants and agrees with endpoint `provider_name` in the captures checked.
That is evidence about its role, not confirmation of OpenRouter's database schema.
`displayName` supplies user-facing naming, but sometimes includes serving variants
such as Fast, Turbo, or BYOK Only. Neither field alone defines a reliable identity.

The public list at https://openrouter.ai/api/v1/providers overlaps the embedded
provider metadata. It was unavailable during part of the retained history and is
not captured in ORCA scans. Maintainer observations suggest incomplete coverage of
known providers; it has not been established as a complete historical registry.

The response checked on 2026-10-10 exposes `name` and `slug`, with location and
policy/status URLs, but no display-name field. It calls `google-vertex` "Google"
and `google-ai-studio` "Google AI Studio". These are distinct user-facing services:
their endpoint offerings and BYOK credentials differ, Vertex hosts Claude, and they
use different logos. "Google Vertex" is the useful service label for the former.

## Differences after removing endpoint configuration

In the 2026-10-07T17:40:37.518Z scan, ORCA's provider-field omission policy leaves
79 providers across 1,381 in-scope endpoint observations. Every remaining disagreement
within a normalized provider is confined to `displayName`:

67 providers have identical cleaned records across all their observations.

Nine have differing labels only on aliases: Alibaba, Baseten, Decart, DeepInfra, Fireworks, Google
Vertex, MiniMax, Moonshot AI, and SambaNova.

Three have competing labels even on the exact base slug: Azure (60 ordinary, one BYOK Only), Amazon
Bedrock (50 ordinary, one BYOK Only), and Morph (six ordinary, one Fast).

Every provider has a base-slug observation. Excluding aliases leaves 1,235 observations; voting over
all observations instead produces the same winners.

This is evidence from one scan, not a guarantee that other provider fields always
agree. Earlier Claude-on-AWS observations below already demonstrate differing
provider policy URLs and BYOK flags across aliases. A relationship between label
variants and internal hosts is plausible, but has not been established generally.

## Historical identity repairs

These observations come from archived production captures and the retained provider
catalog inspected in October 2026. Catalog `scan_at` dates the last fact update;
it does not establish the provider's departure. Transition times below are capture
times, rather than exact upstream change times.

`sambanova-turbo` and `sambanova` coexist in the October capture with the same name and API host.
The turbo spelling is an unslashed serving variant.

`nebius-fast` is present in the earliest retained August 2025 capture. Between
2025-10-07T00:11:13.924Z and 01:11:40.360Z, endpoint `41c6e987-156d-4426-b1d6-d374b0ee760f` changes
its provider slug and tag to `nebius/fast`, retaining its model, API host, and adapter.

Between 2026-07-23T22:50:26.251Z and 2026-07-24T00:50:26.247Z, the same 19 endpoint UUIDs change
from `wandb` to `wandb-legacy`. Their provider host and name agree. This repair retains W&B as its
own historical provider identity.

Retained `model-run` and `modelrun` records share the name `ModelRun`; the later display name is
`ModelRun [by Modular]`. Host and policy URLs differ.

## Claude Platform on AWS

Focused searches located these adjacent absence/presence boundaries. They establish
observed onsets of the runs examined, rather than an exhaustive search for every
earlier appearance or interruption.

| Embedded slug                  | First present capture at the located boundary | Last present capture checked         |
| ------------------------------ | --------------------------------------------- | ------------------------------------ |
| `anthropic/2`                  | 2026-04-03T22:50:00.116Z                      | 2026-08-17T23:30:04.172Z             |
| `anthropic/claude-on-aws`      | 2026-05-30T03:50:00.314Z                      | 2026-08-17T21:30:04.171Z             |
| `amazon-bedrock/claude-on-aws` | 2026-06-09T17:50:00.557Z                      | 2026-08-17T21:30:04.171Z             |
| `claude-on-aws`                | 2026-07-25T20:50:26.218Z                      | Still present in the October capture |

`anthropic/2` initially displayed `Anthropic 2` and used `https://api.anthropic.com/v1`.
The same endpoint UUIDs subsequently displayed `Claude Platform on AWS` and used
`https://aws-external-anthropic.us-east-1.api.aws/v1`; this is visible by May 15.

By August 17, all four spellings use that AWS host and the same service label.
The older named aliases carry AWS policy/status URLs and the `Amazon Bedrock` name;
`anthropic/2` carries Anthropic URLs/name. The canonical record carries Anthropic URLs,
the service name, and a different BYOK flag. Adapter and behavioral defaults also
differ. At 2026-08-18T01:30:04.089Z, only the canonical spelling remains among these
records; some endpoint UUIDs were replaced rather than renamed.
