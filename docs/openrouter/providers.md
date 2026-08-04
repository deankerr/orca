# Providers

OpenRouter's provider fields flatten three distinct concepts. Their similar names obscure
important differences.

## Organization

The organization is the operator users recognize, such as `Azure` or `Amazon Bedrock`. It has no
dedicated API record. In endpoint data it is identified by the display string `provider_name`.

Empirically, `provider_name` is the only endpoint-to-organization grouping that does not produce
orphans. An upstream rename can therefore appear as a change of identity.

Provider slug prefixes cannot recover the organization reliably:

- `sambanova-turbo` is associated with SambaNova without a slash-delimited suffix.
- `anthropic/claude-on-aws` belongs to the organization named `Amazon Bedrock`.

## Provider record

The embedded `provider_info` object describes a targetable provider configuration. One organization
can have multiple records, such as `azure` and `azure/eu`. Same-organization records primarily
differ in slug, display name, base URL, adapter, and routing configuration.

These records are useful routing targets, but should not be mistaken for separate provider
organizations.

📌 **Observed 2026-07-24:** 102 provider records represented provider configurations. Fifteen
organizations had multiple records, including Azure, Google Vertex, and Amazon Bedrock.

## Endpoint targeting key

Endpoint `provider_slug` identifies a targetable configuration or endpoint grouping. OpenRouter's
end-user API exposes the same concept as `tag`.

It can:

- match a provider record, such as `azure`;
- match a provider-record variant, such as `azure/eu`; or
- have no corresponding `provider_info` record, such as `azure/swedencentral` or `novita/fp8`.

⚠️ Suffixes are opaque and provider-specific. They can denote region, quantization, speed, or
another grouping, and there is no complete central registry or universal decomposition rule.

📌 **Observed 2026-07-24:** roughly 100 distinct endpoint targeting keys had no corresponding
`provider_info` record.

## Endpoint-local provider metadata

`provider_display_name`, `provider_model_id`, `provider_region`, and `provider_slug` are endpoint
properties. Evidence includes the same `provider_slug` appearing with different display names, and
many targeting keys having no provider record at all. `provider_model_id` is specifically the
upstream provider's identifier for that endpoint's model.
