# Providers

OpenRouter's provider fields expose overlapping organization, configuration, and endpoint concepts.
The distinctions below describe the 2026-08-28 corpus, not an authoritative upstream entity model.
It contained 105 provider records from 789 text→text models and 186 distinct tags over 1,146 endpoints.

## Organization

`provider_info.name` identified the recognizable operator, such as `Azure` or `Amazon Bedrock`.
It was constant across each organization's records, and every endpoint's `provider_name` agreed
with its owning record's `name`. A rename would appear as an identity change under this grouping.

The 105 records collapsed to 73 organizations. Eighteen had multiple records, including Google,
Amazon Bedrock, Fireworks, and DeepInfra. Slug prefixes cannot reliably recover the organization:
`sambanova-turbo` is a full record slug with no slash-delimited suffix.

## Provider record

The embedded `provider_info` describes a targetable provider configuration. One organization can
have multiple records, such as `azure` and `azure/eu`. Same-organization records differed in `slug`,
`displayName`, `baseUrl`, `adapterName`, and `pricingStrategy`. Azure's regional records had distinct
`baseUrl`s; adapter and pricing strategy varied with the API surface being served.

⚠️ Data policy fields were identical within an organization even when a slug implied otherwise.
Both `xai/zdr` and `mistral/zdr` declared `retainsPrompts: true` and `retentionDays: 30` despite
zero-data-retention labels. The labels alone do not establish compliance behavior.

⚠️ `displayName` cannot group records reliably. `google-vertex/us` and `google-vertex/us-east5`
shared "Google Vertex (US)"; `deepinfra` and `deepinfra/base` shared both `name` and `displayName`.

## Endpoint targeting key

Endpoint `provider_slug` identifies a targetable configuration or endpoint grouping. OpenRouter's
public API exposes the same concept as `tag`. Suffixes denote region, quantization, speed tier,
compliance, or other distinctions without a central registry. Historical tags include
`amazon-bedrock/claude-on-aws`, which embeds a model name.

| Relationship to provider records            | Example                             |
| ------------------------------------------- | ----------------------------------- |
| Exact record match                          | `azure/us`                          |
| Quantization suffix targeting a base record | `deepinfra/fp8` → `deepinfra`       |
| No corresponding record                     | `azure/swedencentral`, `novita/fp8` |

⚠️ The same tag could resolve to different records per endpoint without a model-family pattern.
`google-vertex/global`, `google-vertex/us-east5`, and `amazon-bedrock/us-east-1` each resolved to
both a tagged record and the base record in this corpus.

Of 186 tags, 75 matched a record exactly and 111 had no exact record. Roughly 99 of those 111
were quantization suffixes; the rest were region/speed tags such as `azure/global`, `mistral/eu`,
and `openai/flex`.

## Endpoint-local provider metadata

`provider_display_name`, `provider_name`, `provider_model_id`, `provider_region`, and `provider_slug`
are endpoint fields. `provider_info` is the related provider observation. `provider_model_id`
is the upstream provider's identifier for that endpoint's model.
