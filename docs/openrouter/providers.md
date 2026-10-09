# Provider observations

OpenRouter's embedded provider records mix provider facts, routing variants, and
endpoint configuration. Their fields are evidence, rather than an authoritative
entity model. ORCA's normalization policy lives in `docs/orca/provider-identity.md`.

## Namespaces and metadata

- The 2026-10-07T17:40:37.518Z capture contains 1,604 endpoints, 121 distinct
  `provider_info.slug` values, 92 provider names, and 229 endpoint routing tags.
  ORCA's text scope contains 1,381 endpoints and 108 embedded slugs.
- Endpoint `provider_name` equals `provider_info.name` throughout that capture and
  the earliest retained capture, 2025-08-13T20:19:21.211Z. Names can span several
  provider records. Historical names also conflict with slug families: an
  `anthropic/claude-on-aws` record calls itself `Amazon Bedrock`.
- Multiple provider bodies share a slug. In the October capture, adapter, host,
  pricing strategy, and occasionally display name vary between endpoints. A last
  writer can therefore promote incidental endpoint configuration into provider facts.
- Endpoint policy is the source for behavioral claims. In the October capture,
  142 endpoint/provider policy pairs disagree on a shared key. Terms and privacy
  URLs remain useful provider facts.
- Endpoint tags form another namespace: four tags in the October capture occur
  under multiple embedded provider slugs. Preserve the tag supplied on each endpoint.
- Older provider bodies include owners/editors, model denylists, region overrides,
  multipart capability, and behavioral policies nested under `dataPolicy.paidModels`.

## Historical identity repairs

These observations come from archived production captures and the retained provider
catalog inspected in October 2026. Catalog `scan_at` dates the last fact update;
it does not establish the provider's departure. Transition times below are capture
times, rather than exact upstream change times.

- `sambanova-turbo` and `sambanova` coexist in the October capture with the same name
  and API host. The turbo spelling is an unslashed serving variant.
- `nebius-fast` is present in the earliest retained August 2025 capture. Between
  2025-10-07T00:11:13.924Z and 01:11:40.360Z, endpoint
  `41c6e987-156d-4426-b1d6-d374b0ee760f` changes its provider slug and tag to
  `nebius/fast`, retaining its model, API host, and adapter.
- Between 2026-07-23T22:50:26.251Z and 2026-07-24T00:50:26.247Z, the same 19
  endpoint UUIDs change from `wandb` to `wandb-legacy`. Their provider host and
  name agree. This repair retains W&B as its own historical provider identity.
- Retained `model-run` and `modelrun` records share the name `ModelRun`; the later
  display name is `ModelRun [by Modular]`. Host and policy URLs differ.

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
